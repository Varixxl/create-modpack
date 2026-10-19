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

  let Iris = null;
  try {
    Iris = Java.loadClass('net.irisshaders.iris.Iris');
  } catch (e) {
    console.warn('[GraphicsPresets] Iris/Oculus class not available: ' + e);
  }

  let DhQuality = null;
  let DhFog = null;
  let DhThreading = null;
  let EDhApiVerticalQuality = null;
  try {
    DhQuality = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Client$Advanced$Graphics$Quality');
    DhFog = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Client$Advanced$Graphics$Fog');
    DhThreading = Java.loadClass('com.seibel.distanthorizons.core.config.Config$Common$MultiThreading');
    EDhApiVerticalQuality = Java.loadClass('com.seibel.distanthorizons.api.enums.config.EDhApiVerticalQuality');
  } catch (e) {
    console.warn('[GraphicsPresets] Distant Horizons config classes not available: ' + e);
  }

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
    if (Iris == null) return;
    try {
      let props = new Properties();
      if (mode === 'low') {
        props.setProperty('PROFILE', '2');
        props.setProperty('RP_MODE', '0');
        props.setProperty('POM', 'false');
        props.setProperty('SHADOW_QUALITY', '1');
        props.setProperty('shadowDistance', '96.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '1');
        props.setProperty('WATER_REFLECT_QUALITY', '0');
        props.setProperty('BORDER_FOG', 'true');
        props.setProperty('ATM_FOG_MULT', '0.95');
      } else if (mode === 'medium') {
        props.setProperty('PROFILE', '3');
        props.setProperty('RP_MODE', '1');
        props.setProperty('CUSTOM_PBR', 'true');
        props.setProperty('POM', 'true');
        props.setProperty('POM_DEPTH', '0.65');
        props.setProperty('POM_QUALITY', '32');
        props.setProperty('POM_DISTANCE', '24');
        props.setProperty('POM_LIGHTING_MODE', '2');
        props.setProperty('SHADOW_QUALITY', '2');
        props.setProperty('shadowDistance', '160.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '2');
        props.setProperty('WATER_REFLECT_QUALITY', '1');
        props.setProperty('BORDER_FOG', 'true');
        props.setProperty('ATM_FOG_MULT', '0.95');
      } else {
        props.setProperty('PROFILE', '4');
        props.setProperty('RP_MODE', '1');
        props.setProperty('CUSTOM_PBR', 'true');
        props.setProperty('POM', 'true');
        props.setProperty('POM_DEPTH', '0.80');
        props.setProperty('POM_QUALITY', '64');
        props.setProperty('POM_DISTANCE', '32');
        props.setProperty('POM_LIGHTING_MODE', '2');
        props.setProperty('SHADOW_QUALITY', '3');
        props.setProperty('shadowDistance', '192.0');
        props.setProperty('LIGHTSHAFT_QUALI_DEFINE', '3');
        props.setProperty('WATER_REFLECT_QUALITY', '2');
        props.setProperty('BORDER_FOG', 'true');
        props.setProperty('ATM_FOG_MULT', '0.95');
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
    if (DhQuality == null || EDhApiVerticalQuality == null) return;
    try {
      if (mode === 'low') {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(32));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.LOW);
        if (DhFog != null) {
          DhFog.farFogStart.set(Float.valueOf(0.4));
          DhFog.farFogDensity.set(Float.valueOf(2.8));
        }
        if (DhThreading != null) {
          DhThreading.numberOfThreads.set(Integer.valueOf(2));
        }
      } else if (mode === 'medium') {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(64));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.MEDIUM);
        if (DhFog != null) {
          DhFog.farFogStart.set(Float.valueOf(0.5));
          DhFog.farFogDensity.set(Float.valueOf(2.2));
        }
        if (DhThreading != null) {
          DhThreading.numberOfThreads.set(Integer.valueOf(2));
        }
      } else {
        DhQuality.lodChunkRenderDistanceRadius.set(Integer.valueOf(64));
        DhQuality.verticalQuality.set(EDhApiVerticalQuality.HIGH);
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
        showPresetToast('§e§lLow Preset Applied', '§7DH 32 Chunks • POM Off • ' + refreshRate + ' FPS Lock');
      } else if (mode === 'medium') {
        updateStatusVariable('§b§lMEDIUM', refreshRate);
        showPresetToast('§b§lMedium Preset Applied', '§7DH 64 Chunks • Balanced POM • ' + refreshRate + ' FPS Lock');
      } else {
        updateStatusVariable('§d§lULTRA', refreshRate);
        showPresetToast('§d§lUltra Preset Applied', '§7DH 64 High • Deep POM • ' + refreshRate + ' FPS Lock');
      }

      console.info('[GraphicsPresets] Applied preset: ' + mode + ' (' + refreshRate + ' Hz)');
    } catch (e) {
      console.error('[GraphicsPresets] Failed to apply preset: ' + e);
      showPresetToast('§c§lGraphics Presets Error', '§7' + e);
    }
  }

  // Initialize status variable and clear any stale request
  try {
    VariableHandler.setVariable('graphics_preset_request', '');
    if (!VariableHandler.variableExists('graphics_preset_status')) {
      updateStatusVariable('§b§lMEDIUM (Default)', getDetectedRefreshRate());
    }
  } catch (e) {
    console.warn('[GraphicsPresets] Init variable warning: ' + e);
  }

  // Poll FancyMenu variable requests on every client tick (works in both menus & worlds)
  let pollCounter = 0;
  let pollTask = function() {
    try {
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
