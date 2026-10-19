// priority: 5
// Music Delay Regulator - Smooth Background & Menu Music Cycling
// Automatically regulates the silent delay between tracks in menus and in-game.

(function() {
  console.info('[MusicDelayTuner] Initializing Music Delay Regulator...');

  let Minecraft = null;
  let MinecraftForge = null;
  let EventPriority = null;
  let ClientTickEventClass = null;

  try {
    Minecraft = Java.loadClass('net.minecraft.client.Minecraft');
    MinecraftForge = Java.loadClass('net.minecraftforge.common.MinecraftForge');
    EventPriority = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority');
    ClientTickEventClass = Java.loadClass('net.minecraftforge.event.TickEvent$ClientTickEvent');
  } catch (e) {
    console.error('[MusicDelayTuner] Failed to load Forge/Minecraft classes: ' + e);
    return;
  }

  let menuDelayTicks = 30; // 1.5 seconds between menu songs
  let gameDelayTicks = 60; // 3.0 seconds between in-game ambient songs

  try {
    let FileClass = Java.loadClass('java.io.File');
    let FilesClass = Java.loadClass('java.nio.file.Files');
    let StandardCharsets = Java.loadClass('java.nio.charset.StandardCharsets');
    let JavaString = Java.loadClass('java.lang.String');

    let configFile = new FileClass('kubejs/config/music_delay.json');
    if (configFile.exists()) {
      let raw = new JavaString(FilesClass.readAllBytes(configFile.toPath()), StandardCharsets.UTF_8);
      let parsed = JSON.parse(raw);
      if (typeof parsed.menu_delay_ticks === 'number') menuDelayTicks = Math.max(10, Math.floor(parsed.menu_delay_ticks));
      if (typeof parsed.game_delay_ticks === 'number') gameDelayTicks = Math.max(10, Math.floor(parsed.game_delay_ticks));
    } else {
      configFile.getParentFile().mkdirs();
      let defaultObj = {
        menu_delay_ticks: 30,
        game_delay_ticks: 60
      };
      let jsonStr = JSON.stringify(defaultObj, null, 2);
      FilesClass.write(configFile.toPath(), new JavaString(jsonStr).getBytes(StandardCharsets.UTF_8));
    }
  } catch (e) {
    console.warn('[MusicDelayTuner] Notice on config load: ' + e);
  }

  let delayField = null;
  let currentMusicField = null;
  let fieldsResolved = false;

  function resolveFields(mm) {
    if (fieldsResolved) return (delayField != null);
    fieldsResolved = true;

    try {
      let clazz = mm.getClass();
      while (clazz && clazz.getName() !== 'java.lang.Object') {
        let fields = clazz.getDeclaredFields();
        for (let i = 0; i < fields.length; i++) {
          let f = fields[i];
          let mods = f.getModifiers();
          if (Java.loadClass('java.lang.reflect.Modifier').isStatic(mods)) continue;

          let name = f.getName();
          let typeName = f.getType().getName();

          // Delay field: int (f_120180_ or nextSongDelay)
          if (!delayField && (name === 'f_120180_' || name === 'nextSongDelay' || typeName === 'int')) {
            f.setAccessible(true);
            delayField = f;
          }

          // Current music field: SoundInstance (f_120179_ or currentMusic)
          if (!currentMusicField && (name === 'f_120179_' || name === 'currentMusic' || (typeName.indexOf('SoundInstance') !== -1 && name.indexOf('FancyMenu') === -1))) {
            f.setAccessible(true);
            currentMusicField = f;
          }
        }
        clazz = clazz.getSuperclass();
      }
    } catch (e) {
      console.error('[MusicDelayTuner] Error resolving fields: ' + e);
    }

    if (delayField != null) {
      console.info('[MusicDelayTuner] Successfully hooked MusicManager (delayField=' + delayField.getName() + (currentMusicField ? (', currentMusicField=' + currentMusicField.getName()) : '') + ')');
    } else {
      console.error('[MusicDelayTuner] Could not locate nextSongDelay field on ' + mm.getClass().getName());
    }
    return (delayField != null);
  }

  function getMusicManager(mc) {
    try {
      if (typeof mc.getMusicManager === 'function') {
        let mm = mc.getMusicManager();
        if (mm) return mm;
      }
    } catch (e) {}
    try {
      if (typeof mc.m_91397_ === 'function') {
        let mm = mc.m_91397_();
        if (mm) return mm;
      }
    } catch (e) {}
    try {
      if (mc.musicManager) return mc.musicManager;
    } catch (e) {}
    return null;
  }

  function getSoundManager(mc) {
    try {
      if (typeof mc.getSoundManager === 'function') return mc.getSoundManager();
    } catch (e) {}
    try {
      if (typeof mc.m_91106_ === 'function') return mc.m_91106_();
    } catch (e) {}
    try {
      if (mc.soundManager) return mc.soundManager;
    } catch (e) {}
    return null;
  }

  function isSoundActive(sm, soundInstance) {
    if (!sm || !soundInstance) return false;
    try {
      if (typeof sm.isActive === 'function') return sm.isActive(soundInstance);
    } catch (e) {}
    try {
      if (typeof sm.m_120403_ === 'function') return sm.m_120403_(soundInstance);
    } catch (e) {}
    return true;
  }

  global.music_delay_tuner_tick = function(event) {
    try {
      // Run only during END phase so MusicManager.tick() has already evaluated
      let phaseName = (event.phase && typeof event.phase.name === 'function') ? event.phase.name() : ('' + event.phase);
      if (phaseName !== 'END') return;

      let mc = Minecraft.getInstance();
      if (!mc) return;

      let mm = getMusicManager(mc);
      if (!mm) return;

      if (!resolveFields(mm)) return;

      // Check if music is actively playing
      let currentMusic = null;
      if (currentMusicField) {
        try {
          currentMusic = currentMusicField.get(mm);
        } catch (e) {}
      }

      if (currentMusic != null) {
        let sm = getSoundManager(mc);
        if (isSoundActive(sm, currentMusic)) {
          // Song is currently playing; do not adjust delay
          return;
        }
      }

      // No music is playing; read current nextSongDelay
      let currentDelay = -1;
      try {
        currentDelay = delayField.getInt(mm);
      } catch (e) {
        return;
      }

      // If currentDelay is <= 0, MusicManager will pick and play next tick
      if (currentDelay <= 0) return;

      let isMenu = (mc.level == null);
      let targetDelay = isMenu ? menuDelayTicks : gameDelayTicks;

      // Clamp down long delays to targetDelay (1.5 - 3.0 seconds)
      if (currentDelay > targetDelay) {
        delayField.setInt(mm, targetDelay);
      }
    } catch (err) {}
  };

  if (!global.music_delay_tuner_registered) {
    global.music_delay_tuner_registered = true;
    MinecraftForge.EVENT_BUS.addListener(EventPriority.NORMAL, false, ClientTickEventClass, event => {
      if (typeof global.music_delay_tuner_tick === 'function') {
        global.music_delay_tuner_tick(event);
      }
    });
    console.info('[MusicDelayTuner] Registered ClientTickEvent listener on Forge bus (menu=' + menuDelayTicks + 't, game=' + gameDelayTicks + 't)');
  }
})();
