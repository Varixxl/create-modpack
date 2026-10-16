// priority: 5
// Create Modpack Graphics Presets & Display Refresh Rate Synchronizer
// Supports Low, Medium, and Ultra presets with native monitor refresh rate locking

(function() {
  console.info('[GraphicsPresets] Initializing Graphics Presets Engine...');

  const Minecraft = Java.loadClass('net.minecraft.client.Minecraft');
  const Component = Java.loadClass('net.minecraft.network.chat.Component');
  const GLFW = Java.loadClass('org.lwjgl.glfw.GLFW');
  const Files = Java.loadClass('java.nio.file.Files');
  const Paths = Java.loadClass('java.nio.file.Paths');
  const StandardCopyOption = Java.loadClass('java.nio.file.StandardCopyOption');

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

  function sendClientFeedback(messageText) {
    try {
      let mc = Minecraft.getInstance();
      if (mc.player != null) {
        mc.player.displayClientMessage(Component.literal(messageText), false);
      } else {
        console.info('[GraphicsPresets] ' + messageText);
      }
    } catch (e) {
      console.info('[GraphicsPresets] ' + messageText);
    }
  }

  function applyPreset(presetName) {
    let mode = (presetName + '').toLowerCase().trim();
    if (mode !== 'low' && mode !== 'medium' && mode !== 'ultra') {
      sendClientFeedback('§c[Graphics Presets] Unknown preset: ' + mode + '. Valid options: low, medium, ultra');
      return;
    }

    try {
      let mc = Minecraft.getInstance();
      let gameDir = mc.gameDirectory.toPath();
      let refreshRate = getDetectedRefreshRate();

      // 1. Copy Shaderpack config
      let presetShader = gameDir.resolve('config/presets/' + mode + '/ComplementaryUnbound_r5.9.3.zip.txt');
      let targetShader = gameDir.resolve('shaderpacks/ComplementaryUnbound_r5.9.3.zip.txt');
      if (Files.exists(presetShader)) {
        Files.copy(presetShader, targetShader, StandardCopyOption.REPLACE_EXISTING);
      }

      // 2. Copy Distant Horizons config
      let presetDH = gameDir.resolve('config/presets/' + mode + '/DistantHorizons.toml');
      let targetDH = gameDir.resolve('config/DistantHorizons.toml');
      if (Files.exists(presetDH)) {
        Files.copy(presetDH, targetDH, StandardCopyOption.REPLACE_EXISTING);
      }

      // 3. Update options.txt and in-game Options
      let rd = 12;
      let sd = 8;
      if (mode === 'low') {
        rd = 8;
        sd = 6;
      } else if (mode === 'ultra') {
        rd = 14;
        sd = 10;
      }

      try {
        if (mc.options != null) {
          if (mc.options.renderDistance != null) mc.options.renderDistance().set(rd);
          if (mc.options.simulationDistance != null) mc.options.simulationDistance().set(sd);
          if (mc.options.framerateLimit != null) mc.options.framerateLimit().set(refreshRate);
          mc.options.save();
        }
      } catch (err) {
        console.warn('[GraphicsPresets] Could not set options in-memory: ' + err);
      }

      // Ensure options.txt file on disk is also updated
      let optionsPath = gameDir.resolve('options.txt');
      if (Files.exists(optionsPath)) {
        let lines = Files.readAllLines(optionsPath);
        let updatedLines = [];
        for (let i = 0; i < lines.size(); i++) {
          let line = lines.get(i);
          if (line.startsWith('renderDistance:')) {
            updatedLines.push('renderDistance:' + rd);
          } else if (line.startsWith('simulationDistance:')) {
            updatedLines.push('simulationDistance:' + sd);
          } else if (line.startsWith('maxFps:')) {
            updatedLines.push('maxFps:' + refreshRate);
          } else {
            updatedLines.push(line);
          }
        }
        Files.write(optionsPath, updatedLines);
      }

      let summary = '';
      if (mode === 'low') {
        summary = '§eLow Preset Applied §7(DH 32 Chunks • POM Off • Fast Shadows • ' + refreshRate + ' FPS Lock)';
      } else if (mode === 'medium') {
        summary = '§bMedium Preset Applied §7(DH 64 Chunks • Patrix POM Balanced • ' + refreshRate + ' FPS Lock)';
      } else {
        summary = '§dUltra Preset Applied §7(DH 64 Chunks High • Patrix POM Deep • High Shadows • ' + refreshRate + ' FPS Lock)';
      }

      sendClientFeedback('§6[Graphics Presets] ' + summary);
    } catch (e) {
      console.error('[GraphicsPresets] Failed to apply preset: ' + e);
      sendClientFeedback('§c[Graphics Presets] Failed to apply preset: ' + e);
    }
  }

  // Intercept client chat commands
  ClientEvents.chat(function(event) {
    let msg = (event.message + '').trim();
    if (msg.startsWith('/preset ') || msg === '/preset') {
      event.cancel();
      let parts = msg.split(' ');
      if (parts.length < 2) {
        let rate = getDetectedRefreshRate();
        sendClientFeedback('§6[Graphics Presets] §7Detected Display: §a' + rate + ' Hz');
        sendClientFeedback('§7Usage: §f/preset <low | medium | ultra>');
        return;
      }
      applyPreset(parts[1]);
    }
  });

  // Auto-lock framerate to monitor refresh rate on world join
  ClientEvents.loggedIn(function(event) {
    try {
      let mc = Minecraft.getInstance();
      let rate = getDetectedRefreshRate();
      if (mc.options != null && rate > 0) {
        let cur = mc.options.framerateLimit().get();
        if (cur !== rate) {
          mc.options.framerateLimit().set(rate);
          mc.options.save();
          console.info('[GraphicsPresets] Synchronized framerate cap to monitor: ' + rate + ' FPS');
        }
      }
    } catch (e) {
      console.warn('[GraphicsPresets] Startup refresh rate sync note: ' + e);
    }
  });

  console.info('[GraphicsPresets] Graphics Presets Engine Ready.');
})();
