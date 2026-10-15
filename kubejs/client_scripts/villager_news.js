// priority: 10
// Villager News 1.0 - Client Side Port for Minecraft Forge 1.20.1
// Full Integration: Audio Voice Lines, 3D EMF Lip-Sync Mouth Animations & Contextual Dialogue System

(function() {
  console.info('[VillagerNews] Initializing Villager News Client Engine v3...');

  const Minecraft = Java.loadClass('net.minecraft.client.Minecraft');
  const ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation');
  const SoundEvent = Java.loadClass('net.minecraft.sounds.SoundEvent');
  const SoundSource = Java.loadClass('net.minecraft.sounds.SoundSource');
  const Component = Java.loadClass('net.minecraft.network.chat.Component');
  const JavaFloat = Java.loadClass('java.lang.Float');

  let VillagerClass = null;
  try { VillagerClass = Java.loadClass('net.minecraft.world.entity.npc.Villager'); } catch (e) {}
  let WanderingTraderClass = null;
  try { WanderingTraderClass = Java.loadClass('net.minecraft.world.entity.npc.WanderingTrader'); } catch (e) {}

  let JavaSupplier = null;
  try { JavaSupplier = Java.loadClass('java.util.function.Supplier'); } catch (e) {}

  let EMFAnimationApi = null;
  try {
    EMFAnimationApi = Java.loadClass('traben.entity_model_features.EMFAnimationApi');
  } catch (e) {
    console.warn('[VillagerNews] EMFAnimationApi class not loaded: ' + e);
  }

  // Robust Supplier helper for EMF registration
  const makeFloatSupplier = function(fn) {
    let getFn = function() {
      try {
        return JavaFloat.valueOf(Number(fn()));
      } catch (e) {
        return JavaFloat.valueOf(0.0);
      }
    };
    if (JavaSupplier != null) {
      try {
        return new JavaSupplier({ get: getFn });
      } catch (e) {}
    }
    return getFn;
  };

  // Safe entity type checkers (works reliably across all loaders & Rhino environments)
  function isVillager(ent) {
    if (!ent) return false;
    try {
      if (typeof ent.getType === 'function') {
        let t = ent.getType().toString();
        if (t.includes('villager') || t.includes('wandering_trader')) return true;
      }
    } catch (e) {}
    try {
      if (VillagerClass != null && VillagerClass.isInstance(ent)) return true;
    } catch (e) {}
    try {
      if (WanderingTraderClass != null && WanderingTraderClass.isInstance(ent)) return true;
    } catch (e) {}
    return false;
  }

  function isWanderingTrader(ent) {
    if (!ent) return false;
    try {
      if (typeof ent.getType === 'function') {
        return ent.getType().toString().includes('wandering_trader');
      }
    } catch (e) {}
    try {
      if (WanderingTraderClass != null && WanderingTraderClass.isInstance(ent)) return true;
    } catch (e) {}
    return false;
  }

  // 1. Data File Loading via KubeJS JsonIO
  function loadJsonFile(filename) {
    let relPath = 'kubejs/config/villager_news/' + filename;
    try {
      if (typeof JsonIO !== 'undefined') {
        if (typeof JsonIO.readString === 'function') {
          let str = JsonIO.readString(relPath);
          if (str) return JSON.parse(str);
        }
        if (typeof JsonIO.read === 'function') {
          let map = JsonIO.read(relPath);
          if (map) return map;
        }
      }
    } catch (e) {
      console.warn('[VillagerNews] Failed to load ' + filename + ' via JsonIO: ' + e);
    }
    return null;
  }

  let dialoguesData = loadJsonFile('dialogues.json') || { groups: {} };
  let mouthData = loadJsonFile('mouth_animations.json') || {};
  let subtitlesData = loadJsonFile('subtitles.json') || {};
  let soundToDialogue = loadJsonFile('sound_to_dialogue.json') || {};

  let groupCount = (dialoguesData.groups && typeof dialoguesData.groups === 'object')
    ? Object.keys(dialoguesData.groups).length : 0;
  console.info('[VillagerNews] Loaded ' + groupCount + ' dialogue groups, ' +
    Object.keys(mouthData).length + ' mouth animation sets, ' +
    Object.keys(subtitlesData).length + ' subtitles, ' +
    Object.keys(soundToDialogue).length + ' sound mappings.');

  // 2. Active Speakers & Mouth Animation State
  const activeSpeakers = {};
  let singleSpeaker = null;
  let activeCount = 0;

  let fallbackUntil = 0;
  let fallbackStart = 0;

  function getCurrentSpeaker() {
    if (EMFAnimationApi != null) {
      try {
        let emfEntity = EMFAnimationApi.getCurrentEntity();
        if (emfEntity != null) {
          try {
            let uuid = emfEntity.etf$getUuid();
            if (uuid != null) {
              let sp = activeSpeakers[uuid.toString()];
              if (sp) return sp;
            }
          } catch (e) {}

          try {
            let optId = emfEntity.etf$getOptifineId();
            if (optId != null) {
              let sp2 = activeSpeakers[optId.toString()];
              if (sp2) return sp2;
            }
          } catch (e) {}

          try {
            if (typeof emfEntity.getId === 'function') {
              let id = emfEntity.getId();
              if (id != null && activeSpeakers[id.toString()]) {
                return activeSpeakers[id.toString()];
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    if (activeCount === 1 && singleSpeaker != null) {
      return singleSpeaker;
    }
    return null;
  }

  function getMouthFrame(speaker, t) {
    let frames = speaker.frames;
    if (!frames || frames.length === 0) return { open: 0.0, width: 1.0, closed: 0.0 };
    if (t <= frames[0][0]) return { open: frames[0][1], width: frames[0][2], closed: frames[0][3] };
    let last = frames[frames.length - 1];
    if (t >= last[0]) return { open: last[1], width: last[2], closed: last[3] };
    for (let i = 0; i < frames.length - 1; i++) {
      let f0 = frames[i];
      let f1 = frames[i + 1];
      if (f0[0] <= t && t <= f1[0]) {
        let dt = f1[0] - f0[0];
        if (dt <= 0) return { open: f0[1], width: f0[2], closed: f0[3] };
        let a = (t - f0[0]) / dt;
        return {
          open: f0[1] + (f1[1] - f0[1]) * a,
          width: f0[2] + (f1[2] - f0[2]) * a,
          closed: f0[3] + (f1[3] - f0[3]) * a
        };
      }
    }
    return { open: 0.0, width: 1.0, closed: 0.0 };
  }

  function getMouthOpen() {
    let sp = getCurrentSpeaker();
    if (sp != null) {
      let now = Date.now();
      let elapsed = (now - sp.startTime) / 1000.0;
      if (elapsed >= 0 && elapsed <= sp.duration) {
        return getMouthFrame(sp, elapsed).open;
      }
    }
    let now = Date.now();
    if (now < fallbackUntil) {
      return Math.abs(Math.sin((now - fallbackStart) * 0.025));
    }
    return 0.0;
  }

  function getMouthWidth() {
    let sp = getCurrentSpeaker();
    if (sp != null) {
      let now = Date.now();
      let elapsed = (now - sp.startTime) / 1000.0;
      if (elapsed >= 0 && elapsed <= sp.duration) {
        return getMouthFrame(sp, elapsed).width;
      }
    }
    return 1.0;
  }

  function getMouthClosed() {
    let sp = getCurrentSpeaker();
    if (sp != null) {
      let now = Date.now();
      let elapsed = (now - sp.startTime) / 1000.0;
      if (elapsed >= 0 && elapsed <= sp.duration) {
        return getMouthFrame(sp, elapsed).closed;
      }
    }
    return 0.0;
  }

  function getSpeaking() {
    let sp = getCurrentSpeaker();
    if (sp != null) {
      let now = Date.now();
      let elapsed = (now - sp.startTime) / 1000.0;
      if (elapsed >= 0 && elapsed <= sp.duration) {
        return 1.0;
      }
    }
    if (Date.now() < fallbackUntil) {
      return 1.0;
    }
    return 0.0;
  }

  // 3. Register EMF Variables via EMFAnimationApi
  try {
    let VariableRegistry = Java.loadClass('traben.entity_model_features.models.animation.math.variables.VariableRegistry');
    let reg = VariableRegistry.getInstance();

    let vnapVars = [
      "vnap_speaking", "vnap_mouth_open", "vnap_mouth_width", "vnap_mouth_closed",
      "vnap_has_nose", "vnap_cosmetic_mayor_hat", "vnap_cosmetic_helmet",
      "vnap_cosmetic_microphone", "vnap_cosmetic_moustache"
    ];

    // Remove any stale variables from ASM map
    for (let i = 0; i < vnapVars.length; i++) {
      reg.singletonASMVariablesFloat.remove(vnapVars[i]);
    }

    // Clear singletonVariables map via reflection to ensure re-registration succeeds
    try {
      let f = reg.getClass().getDeclaredField('singletonVariables');
      f.setAccessible(true);
      let sMap = f.get(reg);
      if (sMap != null) {
        for (let i = 0; i < vnapVars.length; i++) {
          sMap.remove(vnapVars[i]);
          sMap.remove("-" + vnapVars[i]);
        }
      }
    } catch (e) {
      console.warn('[VillagerNews] Note: singletonVariables cleanup: ' + e);
    }

    if (EMFAnimationApi != null) {
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_speaking", "Speaking flag", makeFloatSupplier(() => getSpeaking()));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_mouth_open", "Mouth open factor", makeFloatSupplier(() => getMouthOpen()));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_mouth_width", "Mouth width factor", makeFloatSupplier(() => getMouthWidth()));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_mouth_closed", "Mouth closed factor", makeFloatSupplier(() => getMouthClosed()));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_has_nose", "Has nose flag", makeFloatSupplier(() => 1.0));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_cosmetic_mayor_hat", "Mayor hat", makeFloatSupplier(() => 0.0));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_cosmetic_helmet", "Helmet", makeFloatSupplier(() => 0.0));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_cosmetic_microphone", "Microphone", makeFloatSupplier(() => 0.0));
      EMFAnimationApi.registerSingletonAnimationVariable("villager_news", "vnap_cosmetic_moustache", "Moustache", makeFloatSupplier(() => 0.0));
      console.info('[VillagerNews] Successfully registered EMF animation variables via EMFAnimationApi');
    }
  } catch (e) {
    console.error('[VillagerNews] Failed to register EMF variables: ' + e);
  }

  // 4. Subtitle HUD Notification
  function updateSubtitle(speaker, elapsed) {
    if (!speaker.subtitles || speaker.subtitles.length === 0) return;
    let currentKey = null;
    for (let i = 0; i < speaker.subtitles.length; i++) {
      let sub = speaker.subtitles[i];
      if (sub.time <= elapsed) {
        currentKey = sub.key;
      } else {
        break;
      }
    }
    if (currentKey) {
      let rawText = subtitlesData[currentKey] || currentKey;
      let speakerName = "Villager";
      try {
        if (speaker.entity.hasCustomName()) {
          speakerName = speaker.entity.getCustomName().getString();
        } else {
          let prof = speaker.entity.getVillagerData().getProfession().toString();
          let profName = prof.includes(":") ? prof.split(":")[1] : prof;
          speakerName = profName.charAt(0).toUpperCase() + profName.slice(1);
        }
      } catch (e) {}

      let formatted = Component.literal("§e[" + speakerName + "]§r " + rawText);
      try {
        Minecraft.getInstance().gui.setOverlayMessage(formatted, false);
      } catch (e) {}
    }
  }

  // 5. Sound & Dialogue Player
  function playDialogue(entity, groupId, variantIndex) {
    if (!entity || !entity.isAlive()) return false;
    let group = dialoguesData.groups[groupId];
    if (!group || !group.variants || group.variants.length === 0) return false;

    let vIndex = variantIndex;
    if (vIndex === undefined || vIndex < 0 || vIndex >= group.variants.length) {
      vIndex = Math.floor(Math.random() * group.variants.length);
    }
    let variant = group.variants[vIndex];
    if (!variant) return false;

    let soundName = 'dialogue.' + groupId + '.' + vIndex;
    let soundLoc = new ResourceLocation('villager-news-addon-port', soundName);
    let soundEvent = SoundEvent.createVariableRangeEvent(soundLoc);

    let mc = Minecraft.getInstance();

    // Play sound natively in 3D world space
    try {
      if (mc.level) {
        mc.level.playLocalSound(
          entity.getX(),
          entity.getY(),
          entity.getZ(),
          soundEvent,
          SoundSource.NEUTRAL,
          1.0,
          1.0,
          false
        );
      }
    } catch (e) {
      try {
        mc.level.m_7785_(
          entity.getX(),
          entity.getY(),
          entity.getZ(),
          soundEvent,
          SoundSource.NEUTRAL,
          1.0,
          1.0,
          false
        );
      } catch (e2) {
        console.warn('[VillagerNews] Failed to playLocalSound: ' + e2);
      }
    }

    let uuidStr = entity.getUUID().toString();
    let entIdStr = entity.getId().toString();
    let groupMouth = mouthData[groupId];
    let variantMouth = groupMouth && groupMouth[vIndex] ? groupMouth[vIndex] : [];

    let speakerObj = {
      entity: entity,
      uuid: uuidStr,
      entId: entIdStr,
      startTime: Date.now(),
      duration: variant.duration || group.maximumDuration || 3.0,
      frames: variantMouth,
      subtitles: variant.subtitles || []
    };

    activeSpeakers[uuidStr] = speakerObj;
    activeSpeakers[entIdStr] = speakerObj;
    singleSpeaker = speakerObj;
    activeCount++;

    console.info('[VillagerNews] Spoke: ' + soundName + ' (' + speakerObj.duration + 's) for ' + uuidStr);
    updateSubtitle(speakerObj, 0.0);
    return true;
  }

  function triggerGruntFallback() {
    let now = Date.now();
    fallbackStart = now;
    fallbackUntil = now + 750;
  }

  // 6. Cooldown Tracker
  const cooldowns = {};
  function isCool(key, cooldownSeconds) {
    let now = Date.now();
    let last = cooldowns[key] || 0;
    if (now - last >= cooldownSeconds * 1000) {
      cooldowns[key] = now;
      return true;
    }
    return false;
  }

  // 7. Character Cast Determination
  function getCastProfile(villager) {
    try {
      let name = villager.getName().getString().toLowerCase();
      if (name.includes("mayor")) return "mayor";
      if (name.includes("testificate")) return "testificate_man";
      if (name.includes("#5") || name.includes("number 5")) return "number_5";
      if (name.includes("#9") || name.includes("number 9")) return "number_9";
      if (name.includes("unreachable") || name.includes("catch me")) return "unreachable";
    } catch (e) {}
    return "villager";
  }

  // Converts Java Iterable<Entity> to native JavaScript Array safely
  function getLevelEntities(level) {
    let list = [];
    if (!level) return list;
    try {
      let iterable = null;
      try { iterable = level.entitiesForRendering(); } catch (e) {}
      if (!iterable) {
        try { iterable = level.m_104735_(); } catch (e) {}
      }
      if (iterable != null && typeof iterable.forEach === 'function') {
        iterable.forEach(function(ent) {
          if (ent) list.push(ent);
        });
      }
    } catch (e) {}
    return list;
  }

  function findVillagerNear(level, x, y, z, maxDist) {
    let entities = getLevelEntities(level);
    let best = null;
    let bestDistSq = (maxDist || 4.0) * (maxDist || 4.0);
    for (let i = 0; i < entities.length; i++) {
      let ent = entities[i];
      if (isVillager(ent) && ent.isAlive()) {
        let dx = ent.getX() - x;
        let dy = ent.getY() - y;
        let dz = ent.getZ() - z;
        let dsq = dx * dx + dy * dy + dz * dz;
        if (dsq < bestDistSq) {
          bestDistSq = dsq;
          best = ent;
        }
      }
    }
    return best;
  }

  // 8. Interaction Handler (Trading / Talking)
  function handleVillagerInteraction(villager) {
    if (!villager || !villager.isAlive()) return;

    if (isWanderingTrader(villager)) {
      if (isCool("interact_" + villager.getUUID(), 3)) {
        playDialogue(villager, "yubpbb"); // Wandering trader trade lines
      }
      return;
    }

    if (isVillager(villager)) {
      let cast = getCastProfile(villager);

      if (villager.isSleeping()) {
        if (isCool("sleep_" + villager.getUUID(), 10)) {
          playDialogue(villager, "ioxtmt");
        }
        return;
      }

      if (isCool("interact_" + villager.getUUID(), 3)) {
        if (cast === "mayor") {
          playDialogue(villager, "njyapy");
        } else if (cast === "testificate_man") {
          playDialogue(villager, "mpbnsm");
        } else if (cast === "number_5") {
          playDialogue(villager, "sclaoa");
        } else if (cast === "number_9") {
          playDialogue(villager, "snnkrl");
        } else {
          let prof = "";
          try {
            prof = villager.getVillagerData().getProfession().toString();
          } catch (e) {}

          if (prof.includes("nitwit")) {
            playDialogue(villager, "nukxsf");
          } else if (prof.includes("none")) {
            playDialogue(villager, "nlbhku");
          } else {
            playDialogue(villager, "clbjww"); // 6 trade opening lines
          }
        }
      }
    }
  }

  // 9. Forge Event Bus Listeners (PlaySoundEvent & EntityInteract)
  global.vnap_onEntityInteract = function(event) {
    try {
      let target = event.getTarget();
      if (!target) return;
      if (isVillager(target)) {
        handleVillagerInteraction(target);
      }
    } catch (e) {}
  };

  global.vnap_onPlaySound = function(event) {
    try {
      let sound = event.getSound();
      if (!sound) return;
      let name = event.getName();
      if (!name) return;

      // Check if this sound is one of our dialogue sound events or voice ogg files!
      let mapped = soundToDialogue[name];
      if (!mapped) {
        let loc = sound.getLocation();
        if (loc) {
          let path = loc.getPath();
          mapped = soundToDialogue[path] || soundToDialogue[loc.toString()] || soundToDialogue[loc.getNamespace() + ':' + path];
        }
      }

      if (mapped) {
        let mc = Minecraft.getInstance();
        if (mc.level) {
          let villager = findVillagerNear(mc.level, sound.getX(), sound.getY(), sound.getZ(), 8.0);
          if (villager && villager.isAlive()) {
            let groupId = mapped.groupId;
            let vIndex = mapped.vIndex;
            let group = dialoguesData.groups[groupId];
            let variant = group && group.variants ? group.variants[vIndex] : null;
            let groupMouth = mouthData[groupId];
            let variantMouth = groupMouth && groupMouth[vIndex] ? groupMouth[vIndex] : [];

            let uuidStr = villager.getUUID().toString();
            let entIdStr = villager.getId().toString();

            let speakerObj = {
              entity: villager,
              uuid: uuidStr,
              entId: entIdStr,
              startTime: Date.now(),
              duration: (variant && variant.duration) || 3.0,
              frames: variantMouth,
              subtitles: (variant && variant.subtitles) || []
            };

            activeSpeakers[uuidStr] = speakerObj;
            activeSpeakers[entIdStr] = speakerObj;
            singleSpeaker = speakerObj;
            activeCount++;

            updateSubtitle(speakerObj, 0.0);
          }
        }
      }
    } catch (e) {}
  };

  try {
    let MinecraftForge = Java.loadClass('net.minecraftforge.common.MinecraftForge');
    let EventPriority = Java.loadClass('net.minecraftforge.eventbus.api.EventPriority');
    let EntityInteractClass = Java.loadClass('net.minecraftforge.event.entity.player.PlayerInteractEvent$EntityInteract');
    let PlaySoundEventClass = Java.loadClass('net.minecraftforge.client.event.sound.PlaySoundEvent');

    if (!global.vnap_forge_bus_initialized) {
      global.vnap_forge_bus_initialized = true;

      MinecraftForge.EVENT_BUS.addListener(EventPriority.NORMAL, false, EntityInteractClass, event => {
        if (typeof global.vnap_onEntityInteract === 'function') {
          global.vnap_onEntityInteract(event);
        }
      });

      MinecraftForge.EVENT_BUS.addListener(EventPriority.NORMAL, false, PlaySoundEventClass, event => {
        if (typeof global.vnap_onPlaySound === 'function') {
          global.vnap_onPlaySound(event);
        }
      });
      console.info('[VillagerNews] Registered Forge event bus listeners (EntityInteract, PlaySoundEvent)');
    }
  } catch (e) {
    console.warn('[VillagerNews] Note: Forge bus listener hook: ' + e);
  }

  // 10. Client Tick State Trackers (Contextual Dialogue Engine)
  let tickCounter = 0;
  let stareTargetUUID = null;
  let stareTicks = 0;
  const greetedVillagers = new Set();
  const lastHurtTimes = {};
  let wasRaining = false;
  let lastDayPeriod = "day";

  ClientEvents.tick(event => {
    let mc = Minecraft.getInstance();
    if (!mc.player || !mc.level) return;

    tickCounter++;

    // A. Clean up active speakers and update subtitles
    let now = Date.now();
    for (let key in activeSpeakers) {
      let sp = activeSpeakers[key];
      let elapsed = (now - sp.startTime) / 1000.0;
      if (elapsed > sp.duration || !sp.entity.isAlive()) {
        delete activeSpeakers[key];
        activeCount = Math.max(0, activeCount - 1);
        if (singleSpeaker === sp) singleSpeaker = null;
      } else {
        updateSubtitle(sp, elapsed);
      }
    }

    // B. Detect Right Click Interaction via crosshair pick
    try {
      let isUsing = false;
      try { isUsing = mc.options.keyUse.consumeClick(); } catch (e) {}
      if (!isUsing) {
        try { isUsing = mc.mouseHandler.isRightPressed(); } catch (e) {}
      }
      if (isUsing) {
        let pick = mc.crosshairPickEntity;
        if (isVillager(pick) && pick.isAlive()) {
          handleVillagerInteraction(pick);
        }
      }
    } catch (e) {}

    // C. Staring Detection (every tick)
    try {
      let pick = mc.crosshairPickEntity;
      if (isVillager(pick) && pick.isAlive() && !pick.isSleeping()) {
        let uuidStr = pick.getUUID().toString();
        if (stareTargetUUID === uuidStr) {
          stareTicks++;
          if (stareTicks >= 50) { // 2.5 seconds of staring
            if (isCool("stare_" + uuidStr, 25)) {
              playDialogue(pick, "cavwps"); // 14 Stare reactions!
            }
            stareTicks = 0;
          }
        } else {
          stareTargetUUID = uuidStr;
          stareTicks = 1;
        }
      } else {
        stareTargetUUID = null;
        stareTicks = 0;
      }
    } catch (e) {}

    // D. Hurt Detection via hurtTime (every tick)
    try {
      let entities = getLevelEntities(mc.level);
      for (let i = 0; i < entities.length; i++) {
        let ent = entities[i];
        if (isVillager(ent) && ent.isAlive()) {
          let uuidStr = ent.getUUID().toString();
          let currentHurt = ent.hurtTime;
          let prevHurt = lastHurtTimes[uuidStr] || 0;
          lastHurtTimes[uuidStr] = currentHurt;

          if (currentHurt >= 9 && prevHurt < 9) {
            triggerGruntFallback();
            if (isCool("hurt_" + uuidStr, 3)) {
              let held = mc.player.getMainHandItem();
              let itemStr = held.getItem().toString().toLowerCase();

              if (ent.distanceTo(mc.player) <= 6) {
                if (itemStr.includes("sword")) {
                  playDialogue(ent, "rueszy"); // Sword damage
                } else if (itemStr.includes("axe")) {
                  playDialogue(ent, "yjctyw"); // Axe damage
                } else if (itemStr.includes("bow")) {
                  playDialogue(ent, "huhcbd"); // Arrow damage
                } else {
                  playDialogue(ent, "wyvzhk"); // General damage
                }
              } else {
                if (ent.isOnFire()) {
                  playDialogue(ent, "etkxko"); // Burning!
                } else {
                  playDialogue(ent, "wyvzhk");
                }
              }
            }
          }
        }
      }
    } catch (e) {}

    // E. Periodic Contextual Checks (Every 20 ticks = 1 second)
    if (tickCounter % 20 === 0) {
      let player = mc.player;
      let level = mc.level;

      // Find nearest villager
      let nearestVillager = null;
      let nearestDist = 999;
      try {
        let entities = getLevelEntities(level);
        for (let i = 0; i < entities.length; i++) {
          let ent = entities[i];
          if (isVillager(ent) && ent.isAlive()) {
            let d = ent.distanceTo(player);
            if (d < nearestDist) {
              nearestDist = d;
              nearestVillager = ent;
            }
          }
        }
      } catch (e) {}

      if (nearestVillager != null && nearestDist <= 5.0) {
        let vUUID = nearestVillager.getUUID().toString();
        let cast = getCastProfile(nearestVillager);

        // Approach greeting
        if (!greetedVillagers.has(vUUID)) {
          greetedVillagers.add(vUUID);
          if (isCool("approach_" + vUUID, 30) && !nearestVillager.isSleeping()) {
            if (cast === "mayor") {
              playDialogue(nearestVillager, "dpwhhs");
            } else if (cast === "testificate_man") {
              playDialogue(nearestVillager, "nmwmrz");
            } else if (cast === "number_5") {
              playDialogue(nearestVillager, "xccwah");
            } else if (cast === "number_9") {
              playDialogue(nearestVillager, "kzogzi");
            } else {
              playDialogue(nearestVillager, "xfpjxq"); // 30 Approach greeting lines!
            }
          }
        }

        // Weapon reaction (holding sword/axe near villager)
        let held = player.getMainHandItem();
        let itemStr = held.getItem().toString().toLowerCase();
        if ((itemStr.includes("sword") || itemStr.includes("axe")) && nearestDist <= 3.5) {
          if (isCool("weapon_" + vUUID, 25) && !nearestVillager.isSleeping()) {
            playDialogue(nearestVillager, "stuirs"); // Weapon apprehension
          }
        }
      }

      // Clear greeted villagers if player moves away
      if (nearestDist > 32.0 && greetedVillagers.size > 0) {
        greetedVillagers.clear();
      }

      // Rain Reaction
      let isRaining = level.isRaining();
      if (isRaining && !wasRaining) {
        if (nearestVillager != null && nearestDist <= 16.0 && isCool("rain_event", 120)) {
          playDialogue(nearestVillager, "scbmka"); // Caught in the rain!
        }
      }
      wasRaining = isRaining;

      // Day / Night transition
      let dayTime = level.getDayTime() % 24000;
      let currentPeriod = dayTime >= 13000 && dayTime < 23000 ? "night" : "day";
      if (currentPeriod !== lastDayPeriod) {
        if (nearestVillager != null && nearestDist <= 16.0 && isCool("time_event", 180)) {
          if (currentPeriod === "night") {
            playDialogue(nearestVillager, "ohdwnz"); // Night reaction
          } else {
            playDialogue(nearestVillager, "zkoewx"); // Morning reaction
          }
        }
        lastDayPeriod = currentPeriod;
      }

      // Ambient Idle Chatter (every 30-45s)
      if (nearestVillager != null && nearestDist <= 12.0 && !nearestVillager.isSleeping()) {
        if (isCool("ambient_village_talk", 30)) {
          let cast = getCastProfile(nearestVillager);
          if (cast === "mayor") {
            playDialogue(nearestVillager, "xxehbq");
          } else if (cast === "testificate_man") {
            playDialogue(nearestVillager, "luoibc");
          } else if (cast === "number_5") {
            playDialogue(nearestVillager, "legnsy");
          } else if (cast === "number_9") {
            playDialogue(nearestVillager, "ezgbfw");
          } else {
            playDialogue(nearestVillager, "lvigit");
          }
        }
      }
    }
  });

  console.info('[VillagerNews] Villager News Client Engine v3 successfully initialized and active!');
})();
