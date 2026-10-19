// priority: 5
// Create Modpack Graphics Presets & Display Refresh Rate Synchronizer
// Supports Low, Medium, and Ultra presets with native monitor refresh rate locking

(function() {
  console.info('[GraphicsPresets] Initializing Graphics Presets Engine...');

  const GLFW = Java.loadClass('org.lwjgl.glfw.GLFW');
  const Properties = Java.loadClass('java.util.Properties');
  const Integer = Java.loadClass('java.lang.Integer');
  const Float = Java.loadClass('java.lang.Float');
  const VariableHandler = Java.loadClass('de.keksuccino.fancymenu.customization.variables.VariableHandler');
  const MainThreadTaskExecutor = Java.loadClass('de.keksuccino.fancymenu.util.threading.MainThreadTaskExecutor');
  const ExecuteTiming = Java.loadClass('de.keksuccino.fancymenu.util.threading.MainThreadTaskExecutor$ExecuteTiming');
  const MinecraftOptions = Java.loadClass('de.keksuccino.fancymenu.util.minecraftoptions.MinecraftOptions');
  const ShowToastAction = Java.loadClass('de.keksuccino.fancymenu.customization.action.actions.other.ShowToastAction');

  let initializedStatus = false;

  function getDetectedRefreshRate() {
    try {
      let monitor = GLFW.glfwGetPrimaryMonitor();
      if (monitor != 0) {
        let vidMode = GLFW.glfwGetVideoMode(monitor);
        if (vidMode != null) {
          let rate = vidMode.refreshRate();
          if (rate > 0) {
            return rate;
          }
        }
      }
    } catch (e) {
      console.warn('[GraphicsPresets] Failed to query GLFW refresh rate: ' + e);
    }
    return 60;
  }

  function showPresetToast(titleText, messageText) {
    try {
      let toastJson = JSON.stringify({
        width: 250,
        durationMs: 4000,
        title: titleText,
        message: messageText,
        iconSource: '',
        backgroundSource: ''
      });
      new ShowToastAction().execute(toastJson);
    } catch (e) {
      console.warn('[GraphicsPresets] Failed to show toast: ' + e);
    }
  }

  function setMcOption(name, val) {
    try {
      let opt = MinecraftOptions.getOption(name);
      if (opt != null) {
        opt.set(val + '');
      }
    } catch (e) {
      console.warn('[GraphicsPresets] Could not set option ' + name + ': ' + e);
    }
  }

  function updateStatusVariable(presetLabel, refreshRate) {
    try {
      VariableHandler.setVariable(
        'graphics_preset_status',
        '§8Active Preset: ' + presetLabel + ' §8| §7Detected Monitor: §a' + refreshRate + ' Hz'
      );
    } catch (e) {
      console.warn('[GraphicsPresets] Could not update status variable: ' + e);
    }
  }

  function applyShaderPreset(mode) {
    try {
      let Iris = Java.loadClass('net.irisshaders.iris.Iris');
      let props = new Properties();
      if (mode === 'low') {
        props.setProperty('RP_MODE', '0');
        props.setProperty('SHADOW_QUALITY', '0');
        props.setProperty('shadowDistance', '96.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '0');
        props.setProperty('WATER_REFLECT_QUALITY', '1');
        props.setProperty('BLOCK_REFLECT_QUALITY', '0');
        props.setProperty('DETAIL_QUALITY', '0');
        props.setProperty('CLOUD_QUALITY', '1');
        props.setProperty('SSAO_QUALI_DEFINE', '0');
        props.setProperty('ENTITY_SHADOW', '-1');
        props.setProperty('RAIN_PUDDLES', '0');
        props.setProperty('IMAGE_SHARPENING', '2');
        props.setProperty('ATM_FOG_MULT', '0.80');
      } else if (mode === 'medium') {
        props.setProperty('RP_MODE', '1');
        props.setProperty('SHADOW_QUALITY', '1');
        props.setProperty('shadowDistance', '128.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '1');
        props.setProperty('WATER_REFLECT_QUALITY', '1');
        props.setProperty('BLOCK_REFLECT_QUALITY', '1');
        props.setProperty('DETAIL_QUALITY', '2');
        props.setProperty('CLOUD_QUALITY', '2');
        props.setProperty('SSAO_QUALI_DEFINE', '2');
        props.setProperty('ENTITY_SHADOW', '-1');
        props.setProperty('RAIN_PUDDLES', '0');
        props.setProperty('IMAGE_SHARPENING', '2');
        props.setProperty('ATM_FOG_MULT', '0.80');
      } else {
        props.setProperty('RP_MODE', '1');
        props.setProperty('SHADOW_QUALITY', '2');
        props.setProperty('shadowDistance', '160.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '2');
        props.setProperty('WATER_REFLECT_QUALITY', '2');
        props.setProperty('BLOCK_REFLECT_QUALITY', '1');
        props.setProperty('DETAIL_QUALITY', '2');
        props.setProperty('CLOUD_QUALITY', '2');
        props.setProperty('SSAO_QUALI_DEFINE', '2');
        props.setProperty('ENTITY_SHADOW', '1');
        props.setProperty('RAIN_PUDDLES', '0');
        props.setProperty('IMAGE_SHARPENING', '2');
        props.setProperty('ATM_FOG_MULT', '0.80');
      }
      Iris.clearShaderPackOptionQueue();
      Iris.queueDefaultShaderPackOptionValues();
      Iris.queueShaderPackOptionsFromProperties(props);
      Iris.reload();
    } catch (e) {
      console.warn('[GraphicsPresets] Shader preset reload warning: ' + e);
    }
  }

  function applyDistantHorizonsPreset(mode) {
    try {
      let DhQuality = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Client$Advanced$Graphics$Quality');
      let DhFog = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Client$Advanced$Graphics$Fog');
      let DhThreading = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Common$MultiThreading');
      let EDhApiVerticalQuality = Java.loadClass('com.seibel.distanthorizons.api.enums.config.EDhApiVerticalQuality');
      let EDhApiMaxHorizontalResolution = Java.loadClass('com.seibel.distanthorizons.api.enums.config.EDhApiMaxHorizontalResolution');

      if (mode === 'low') {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(48));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.MEDIUM);
        DhQuality.maxHorizontalResolution.set(EDhApiMaxHorizontalResolution.FOUR_BLOCKS);
        if (DhFog != null) {
          DhFog.farFogStart.set(Float.valueOf(0.4));
          DhFog.farFogDensity.set(Float.valueOf(2.6));
        }
        if (DhThreading != null) {
          DhThreading.numberOfThreads.set(Integer.valueOf(2));
        }
      } else if (mode === 'medium') {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(64));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.HIGH);
        DhQuality.maxHorizontalResolution.set(EDhApiMaxHorizontalResolution.TWO_BLOCKS);
        if (DhFog != null) {
          DhFog.farFogStart.set(Float.valueOf(0.5));
          DhFog.farFogDensity.set(Float.valueOf(2.2));
        }
        if (DhThreading != null) {
          DhThreading.numberOfThreads.set(Integer.valueOf(2));
        }
      } else {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(96));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.HIGH);
        DhQuality.maxHorizontalResolution.set(EDhApiMaxHorizontalResolution.TWO_BLOCKS);
        if (DhFog != null) {
          DhFog.farFogStart.set(Float.valueOf(0.6));
          DhFog.farFogDensity.set(Float.valueOf(2.0));
        }
        if (DhThreading != null) {
          DhThreading.numberOfThreads.set(Integer.valueOf(3));
        }
      }
    } catch (e) {
      console.warn('[GraphicsPresets] Distant Horizons update warning: ' + e);
    }
  }

  function applyPreset(presetName) {
    let mode = (presetName + '').toLowerCase().trim();
    if (mode !== 'low' && mode !== 'medium' && mode !== 'ultra') {
      showPresetToast('§c§lGraphics Presets', '§7Unknown preset: ' + mode);
      return;
    }

    try {
      let refreshRate = getDetectedRefreshRate();
      let rd = 12;
      let sd = 8;
      if (mode === 'low') {
        rd = 8;
        sd = 6;
      } else if (mode === 'ultra') {
        rd = 14;
        sd = 10;
      }

      // 1. Update Minecraft Options & save options.txt
      setMcOption('renderDistance', rd);
      setMcOption('simulationDistance', sd);
      setMcOption('maxFps', refreshRate);
      MinecraftOptions.save();

      // 2. Update Distant Horizons live & save DistantHorizons.toml
      applyDistantHorizonsPreset(mode);

      // 3. Update Complementary Shaders live & save shaderpacks config
      applyShaderPreset(mode);

      // 4. Update UI status & show toast notification
      if (mode === 'low') {
        updateStatusVariable('§e§lLOW', refreshRate);
        showPresetToast('§e§lLow Preset Applied', '§7DH 48 Chunks • Fast Shaders • ' + refreshRate + ' FPS Lock');
      } else if (mode === 'medium') {
        updateStatusVariable('§b§lMEDIUM', refreshRate);
        showPresetToast('§b§lMedium Preset Applied', '§7DH 64 Chunks • Balanced PBR • ' + refreshRate + ' FPS Lock');
      } else {
        updateStatusVariable('§d§lULTRA', refreshRate);
        showPresetToast('§d§lUltra Preset Applied', '§7DH 96 High • Ultra Shaders • ' + refreshRate + ' FPS Lock');
      }

      console.info('[GraphicsPresets] Applied preset: ' + mode + ' (' + refreshRate + ' Hz)');
    } catch (e) {
      console.error('[GraphicsPresets] Failed to apply preset: ' + e);
      showPresetToast('§c§lGraphics Presets Error', '§7' + e);
    }
  }

  // Poll FancyMenu variable requests on every client tick (works in both menus & worlds)
  let pollCounter = 0;
  let pollTask = function() {
    try {
      if (!initializedStatus) {
        initializedStatus = true;
        VariableHandler.setVariable('graphics_preset_request', '');
        if (!VariableHandler.variableExists('graphics_preset_status')) {
          updateStatusVariable('§b§lMEDIUM (Default)', getDetectedRefreshRate());
        }
      }
      pollCounter++;
      if (pollCounter >= 4) {
        pollCounter = 0;
        let req = VariableHandler.getVariableValue('graphics_preset_request');
        if (req != null) {
          let trimmed = (req + '').trim().toLowerCase();
          if (trimmed === 'low' || trimmed === 'medium' || trimmed === 'ultra') {
            VariableHandler.setVariable('graphics_preset_request', '');
            applyPreset(trimmed);
          }
        }
      }
    } catch (e) {
      // Ignore transient tick errors
    } finally {
      MainThreadTaskExecutor.executeInMainThread(pollTask, ExecuteTiming.POST_CLIENT_TICK);
    }
  };
  MainThreadTaskExecutor.executeInMainThread(pollTask, ExecuteTiming.POST_CLIENT_TICK);

  // Also support /preset <low|medium|ultra> in chat
  ClientEvents.chat(function(event) {
    let msg = (event.message + '').trim();
    if (msg.startsWith('/preset ') || msg === '/preset') {
      event.cancel();
      let parts = msg.split(' ');
      if (parts.length < 2) {
        let rate = getDetectedRefreshRate();
        showPresetToast('§6§lGraphics Presets', '§7Detected Display: §a' + rate + ' Hz §8| §f/preset <low|medium|ultra>');
        return;
      }
      applyPreset(parts[1]);
    }
  });

  // Auto-lock framerate to monitor refresh rate on world join
  ClientEvents.loggedIn(function(event) {
    try {
      let rate = getDetectedRefreshRate();
      if (rate > 0) {
        setMcOption('maxFps', rate);
        MinecraftOptions.save();
        console.info('[GraphicsPresets] Synchronized framerate cap to monitor: ' + rate + ' FPS');
      }
    } catch (e) {
      console.warn('[GraphicsPresets] Startup refresh rate sync note: ' + e);
    }
  });

  console.info('[GraphicsPresets] Graphics Presets Engine Ready.');
})();
