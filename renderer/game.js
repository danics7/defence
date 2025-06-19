const config = {
  type: Phaser.AUTO,
  width: 1600,
  height: 900,
  parent: 'game-container',
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: {
    preload,
    create,
    update
  }
};

let player, cursors, monsters, playerStats, monsterStats, lastMonsterSpawn = 0;
let playerHpBar, hudText;
let bullets, lastFired = 0;
let farm, farmStats, farmHpBar;
let farmDestroyed = false;
let farmRespawnTimer = 0;
let autoFireInterval = 300; // ms
let lastAutoFire = 0;

// 옵션 메뉴 관련 변수
let optionMenu, optionBg, soundOn = true;
let escListenerAdded = false;

// 무기 시스템
let weapons = ['gun', 'laser'];
let currentWeapon = 0;

// 플로팅 데미지 텍스트 그룹
let damageTexts;

// 드랍박스(상자) 그룹
let chests;
// 특전 시스템
let perks = {
  fireRate: 0, // 공격속도
  damage: 0,   // 공격력
  maxHp: 0,    // 최대체력
  dodge: 0,    // 회피율
  speed: 0     // 이동속도
};
// 무기 레벨
let weaponLevels = {
  gun: 1,
  laser: 0 // 0이면 미보유, 1~5 레벨
};
let perkNames = ['fireRate', 'damage', 'maxHp', 'dodge', 'speed'];
let perkDisplay = {
  fireRate: '공속', damage: '공격', maxHp: '체력', dodge: '회피', speed: '이속'
};
let weaponDisplay = { gun: '권총', laser: '레이저' };
let hudPerkText, hudWeaponText;

// 무기 자동발사 시스템
let ownedWeapons = { gun: true, laser: false };
let weaponCooldowns = { gun: 300, laser: 800 };
let lastWeaponFire = { gun: 0, laser: 0 };

let gameStartTime = null;
let playTimeText = null;
let monsterSpawnInterval = 1000;

function preload() {
  this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
  this.load.image('monster', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
  this.load.image('bg', 'https://cdn.pixabay.com/photo/2014/09/07/21/52/space-438079_1280.jpg');
  this.load.image('bullet', 'https://labs.phaser.io/assets/sprites/bullet.png');
  this.load.image('farm', 'https://cdn.pixabay.com/photo/2013/07/12/15/55/farm-150674_1280.png');
  this.load.image('chest', 'https://cdn.pixabay.com/photo/2012/04/13/21/07/box-33637_1280.png');
  this.load.audio('hit', [
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.mp3',
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.ogg',
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.wav'
  ]);
  this.load.audio('hurt', [
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.mp3',
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.ogg',
    'https://cdn.pixabay.com/audio/2022/07/26/audio_124bfae3c2.wav'
  ]);
}

function create() {
  this.add.image(800, 450, 'bg').setDisplaySize(1600, 900).setOrigin(0.5, 0.5);
  playerStats = { hp: 100, maxHp: 100, speed: 200 };
  monsterStats = { hp: 30, atk: 10, speed: 80 };

  player = this.physics.add.sprite(512, 384, 'player');
  player.setCollideWorldBounds(true);

  // 플레이어 체력바
  playerHpBar = this.add.graphics();
  drawPlayerHpBar();

  // HUD (상단 체력 표시)
  hudText = this.add.text(16, 16, '', { font: '24px Arial', fill: '#fff', stroke: '#000', strokeThickness: 3 });
  updateHud();

  monsters = this.physics.add.group();

  cursors = this.input.keyboard.createCursorKeys();

  this.physics.add.overlap(player, monsters, onPlayerHit, null, this);

  // 총알 그룹
  bullets = this.physics.add.group({
    defaultKey: 'bullet',
    maxSize: 30
  });

  // 총알과 몬스터 충돌
  this.physics.add.overlap(bullets, monsters, onBulletHitMonster, null, this);

  // 농장 오브젝트 및 체력
  farmStats = { hp: 200, maxHp: 200 };
  farm = this.physics.add.staticSprite(800, 450, 'farm').setDisplaySize(120, 120);
  farmHpBar = this.add.graphics();
  drawFarmHpBar();

  // 적이 농장에 닿으면 체력 감소
  this.physics.add.overlap(monsters, farm, onMonsterHitFarm, null, this);

  damageTexts = this.add.group();

  gameStartTime = Date.now();
  playTimeText = this.add.text(800, 10, '00:00', { font: '26px Arial', fill: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(200);

  // 옵션 메뉴 생성(숨김)
  optionBg = this.add.rectangle(800, 450, 400, 300, 0x222222, 0.95).setVisible(false).setDepth(100);
  optionMenu = this.add.text(800, 370, '옵션\n\n[S] 소리: ON\n[ESC] 닫기', { font: '32px Arial', fill: '#fff', align: 'center' }).setOrigin(0.5, 0).setVisible(false).setDepth(101);
  // 게임 종료 버튼
  const { ipcRenderer } = window.require ? window.require('electron') : { send: () => {} };
  const quitBtn = this.add.text(800, 520, '게임 종료', { font: '28px Arial', fill: '#f44', backgroundColor: '#222', padding: { left: 16, right: 16, top: 8, bottom: 8 } })
    .setOrigin(0.5, 0)
    .setVisible(false)
    .setDepth(102)
    .setInteractive({ useHandCursor: true })
    .on('pointerdown', () => { if (ipcRenderer && ipcRenderer.send) { ipcRenderer.send('quit-app'); } });

  // ESC로 옵션 메뉴 토글 (document 이벤트로, 일시정지 상태에서도 동작)
  if (!escListenerAdded) {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!optionMenu.visible) {
          optionMenu.setVisible(true);
          optionBg.setVisible(true);
          quitBtn.setVisible(true);
          quitBtn.setInteractive({ useHandCursor: true });
          this.scene.pause();
        } else {
          optionMenu.setVisible(false);
          optionBg.setVisible(false);
          quitBtn.setVisible(false);
          quitBtn.disableInteractive();
          this.scene.resume();
        }
      }
    });
    escListenerAdded = true;
  }

  this.input.keyboard.on('keydown-S', () => {
    if (optionMenu.visible) {
      soundOn = !soundOn;
      optionMenu.setText(`옵션\n\n[S] 소리: ${soundOn ? 'ON' : 'OFF'}\n[ESC] 닫기`);
    }
  });

  chests = this.physics.add.group();
  // 상자와 플레이어 충돌
  this.physics.add.overlap(player, chests, onPlayerGetChest, null, this);
  // HUD 특전/무기 표시
  hudPerkText = this.add.text(16, 52, '', { font: '20px Arial', fill: '#ff0', stroke: '#000', strokeThickness: 2 });
  hudWeaponText = this.add.text(16, 80, '', { font: '20px Arial', fill: '#0ff', stroke: '#000', strokeThickness: 2 });
  updateHudPerkWeapon();
}

function update(time, delta) {
  // 농장 파괴 상태에서도 입력/이동/공격 등 모든 로직이 정상 동작해야 함
  // 플레이어 이동
  player.setVelocity(0);
  if (cursors.left.isDown) player.setVelocityX(-playerStats.speed);
  if (cursors.right.isDown) player.setVelocityX(playerStats.speed);
  if (cursors.up.isDown) player.setVelocityY(-playerStats.speed);
  if (cursors.down.isDown) player.setVelocityY(playerStats.speed);
  // 무기별 자동발사
  if (ownedWeapons.gun && time - lastWeaponFire.gun > weaponCooldowns.gun) {
    fireBulletToNearestMonster.call(this);
    lastWeaponFire.gun = time;
  }
  if (ownedWeapons.laser && weaponLevels.laser > 0 && time - lastWeaponFire.laser > weaponCooldowns.laser) {
    fireLaserToNearestMonster.call(this);
    lastWeaponFire.laser = time;
  }
  // 몬스터 스폰 (1초마다)
  if (time - lastMonsterSpawn > monsterSpawnInterval) {
    spawnMonster(this);
    lastMonsterSpawn = time;
    // 10초마다 스폰 간격 감소(최소 250ms)
    if (monsterSpawnInterval > 250 && Math.floor((Date.now() - gameStartTime) / 10000) > 0) {
      monsterSpawnInterval -= 10;
      if (monsterSpawnInterval < 250) monsterSpawnInterval = 250;
    }
  }
  // 몬스터가 타겟(농장/플레이어) 추적
  monsters.children.iterate(monster => {
    if (!monster || !monster.active) return;
    if (monster.targetType === 0 && !farmDestroyed) {
      this.physics.moveToObject(monster, farm, monsterStats.speed);
    } else {
      this.physics.moveToObject(monster, player, monsterStats.speed);
    }
  });
  // 플레이어 체력바 위치 및 길이 갱신
  drawPlayerHpBar();
  updateHud();
  // 몬스터 체력바 그리기
  monsters.children.iterate(monster => {
    if (!monster || !monster.active) {
      if (monster && monster.hpBar && monster.hpBar.destroy) { monster.hpBar.destroy(); monster.hpBar = null; }
      return;
    }
    if (!monster.hpBar) {
      monster.hpBar = this.add.graphics();
    }
    drawMonsterHpBar(monster);
  });
  drawFarmHpBar();
  // 농장 위에 있을 때 플레이어 체력 회복
  if (!farmDestroyed && Phaser.Geom.Intersects.RectangleToRectangle(player.getBounds(), farm.getBounds())) {
    if (playerStats.hp < playerStats.maxHp) {
      playerStats.hp += 0.5 * (delta / 1000);
      playerStats.hp = Math.floor(playerStats.hp);
      if (playerStats.hp > playerStats.maxHp) playerStats.hp = playerStats.maxHp;
    }
  }
  // 농장 파괴/복구 처리
  if (farmDestroyed) {
    farm.setAlpha(0.3);
    if (this.time.now > farmRespawnTimer) {
      farmStats.hp = farmStats.maxHp;
      farm.setAlpha(1);
      farmDestroyed = false;
    }
  }
  // 게임오버 조건
  if ((farmDestroyed && farmStats.hp <= 0) || playerStats.hp <= 0) {
    this.physics.pause();
    setTimeout(() => { /* location.reload(); */ }, 200);
  }
  // 플레이타임 HUD
  if (playTimeText && gameStartTime) {
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    playTimeText.setText(`${min}:${sec}`);
  }
}

function spawnMonster(scene) {
  // 맵 가장자리 랜덤 위치
  let edge = Phaser.Math.Between(0, 3);
  let x, y;
  if (edge === 0) { x = 0; y = Phaser.Math.Between(0, 768); }
  else if (edge === 1) { x = 1024; y = Phaser.Math.Between(0, 768); }
  else if (edge === 2) { x = Phaser.Math.Between(0, 1024); y = 0; }
  else { x = Phaser.Math.Between(0, 1024); y = 768; }
  const monster = scene.physics.add.sprite(x, y, 'monster');
  monster.hp = monsterStats.hp;
  // 타겟 결정: 0=농장, 1=플레이어
  monster.targetType = Phaser.Math.Between(0, 1);
  monsters.add(monster);
}

function onPlayerHit(player, monster) {
  if (!player || !monster || !monster.active) return;
  const dmg = Math.floor(monsterStats.atk);
  playerStats.hp -= dmg;
  playerStats.hp = Math.floor(playerStats.hp);
  showDamageText.call(this, player.x, player.y, dmg);
  safePlaySound(this, 'hurt');
  if (monster.hpBar && monster.hpBar.destroy) { monster.hpBar.destroy(); monster.hpBar = null; }
  monster.destroy && monster.destroy();
  if (playerStats.hp <= 0) {
    player.setTint(0xff0000);
    player.setVelocity(0);
    setTimeout(() => { /* location.reload(); */ }, 200);
  }
}

function drawPlayerHpBar() {
  if (!playerHpBar) return;
  playerHpBar.clear();
  const barWidth = 100, barHeight = 12;
  const x = player.x - barWidth/2, y = player.y - 40;
  playerHpBar.fillStyle(0x000000, 0.7);
  playerHpBar.fillRect(x, y, barWidth, barHeight);
  playerHpBar.fillStyle(0xff4444, 1);
  playerHpBar.fillRect(x+2, y+2, (barWidth-4) * (playerStats.hp/playerStats.maxHp), barHeight-4);
}

function drawMonsterHpBar(monster) {
  if (!monster.hpBar) return;
  monster.hpBar.clear();
  const barWidth = 40, barHeight = 6;
  const x = monster.x - barWidth/2, y = monster.y - 28;
  monster.hpBar.fillStyle(0x000000, 0.7);
  monster.hpBar.fillRect(x, y, barWidth, barHeight);
  monster.hpBar.fillStyle(0x44ff44, 1);
  monster.hpBar.fillRect(x+1, y+1, (barWidth-2) * (monster.hp/monsterStats.hp), barHeight-2);
}

function updateHud() {
  if (hudText) {
    hudText.setText(`체력: ${Math.floor(playerStats.hp)} / ${Math.floor(playerStats.maxHp)}`);
  }
}

function fireBulletToNearestMonster() {
  let nearest = null;
  let minDist = Infinity;
  monsters.children.iterate(monster => {
    if (monster.active) {
      const dist = Phaser.Math.Distance.Between(player.x, player.y, monster.x, monster.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = monster;
      }
    }
  });
  if (nearest) fireBulletToTarget.call(this, nearest);
}

function fireLaserToNearestMonster() {
  let nearest = null;
  let minDist = Infinity;
  monsters.children.iterate(monster => {
    if (monster.active) {
      const dist = Phaser.Math.Distance.Between(player.x, player.y, monster.x, monster.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = monster;
      }
    }
  });
  if (nearest) fireLaserToTarget.call(this, nearest);
}

function fireBulletToTarget(target) {
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len === 0) return;
  const vx = (dx / len) * 500;
  const vy = (dy / len) * 500;
  const bullet = bullets.get(player.x, player.y);
  if (bullet) {
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body.enable = true;
    bullet.lifetime = this.time.now + 1200;
    bullet.setVelocity(vx, vy);
    bullet.setAngle(Math.atan2(vy, vx) * 180 / Math.PI);
  }
}

function fireLaserToTarget(target) {
  if (!target || !target.active) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.sqrt(dx*dx + dy*dy);
  if (len === 0) return;
  const vx = dx / len;
  const vy = dy / len;
  const laser = this.add.graphics();
  laser.lineStyle(6, 0xff00ff, 0.8);
  laser.beginPath();
  laser.moveTo(player.x, player.y);
  laser.lineTo(player.x + vx * 2000, player.y + vy * 2000);
  laser.strokePath();
  setTimeout(() => { try { laser.destroy(); } catch(e) { } }, 120);
  monsters.children.iterate(monster => {
    if (!monster || !monster.active) return;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, monster.x, monster.y);
    const proj = ((monster.x - player.x) * vx + (monster.y - player.y) * vy);
    const perpDist = Math.abs((monster.x - player.x) * vy - (monster.y - player.y) * vx);
    if (proj > 0 && perpDist < 40 + 8 * (weaponLevels.laser-1)) {
      const dmg = getWeaponDamage('laser');
      monster.hp -= dmg;
      monster.hp = Math.floor(monster.hp);
      showDamageText.call(this, monster.x, monster.y, dmg);
      safePlaySound(this, 'hit');
      if (monster.hp <= 0) {
        if (monster.hpBar && monster.hpBar.destroy) { monster.hpBar.destroy(); monster.hpBar = null; }
        monster.destroy && monster.destroy();
        tryDropChest.call(this, monster.x, monster.y);
      }
    }
  });
}

function onBulletHitMonster(bullet, monster) {
  if (!bullet || !monster || !monster.active) return;
  bullet.destroy && bullet.destroy();
  const dmg = getWeaponDamage('gun');
  if (typeof monster.hp !== 'number') return;
  monster.hp -= dmg;
  monster.hp = Math.floor(monster.hp);
  showDamageText.call(this, monster.x, monster.y, dmg);
  safePlaySound(this, 'hit');
  if (monster.hp <= 0) {
    if (monster.hpBar && monster.hpBar.destroy) { monster.hpBar.destroy(); monster.hpBar = null; }
    monster.destroy && monster.destroy();
    tryDropChest.call(this, monster.x, monster.y);
  }
}

function drawFarmHpBar() {
  if (!farmHpBar) return;
  farmHpBar.clear();
  const barWidth = 100, barHeight = 14;
  const x = farm.x - barWidth/2, y = farm.y - 80;
  farmHpBar.fillStyle(0x000000, 0.7);
  farmHpBar.fillRect(x, y, barWidth, barHeight);
  farmHpBar.fillStyle(0x44aaff, 1);
  farmHpBar.fillRect(x+2, y+2, (barWidth-4) * (farmStats.hp/farmStats.maxHp), barHeight-4);
}

function onMonsterHitFarm(monster, farmObj) {
  if (!monster || !monster.active) return;
  const dmg = Math.floor(monsterStats.atk);
  farmStats.hp -= dmg;
  farmStats.hp = Math.floor(farmStats.hp);
  showDamageText.call(this, farm.x, farm.y, dmg);
  safePlaySound(this, 'hurt');
  if (farmStats.hp <= 0) {
    farmStats.hp = 0;
    farmDestroyed = true;
    farmRespawnTimer = this.time.now + 4000; // 4초 후 복구
  }
  if (monster.hpBar && monster.hpBar.destroy) { monster.hpBar.destroy(); monster.hpBar = null; }
  monster.destroy && monster.destroy();
}

function showDamageText(x, y, dmg) {
  const txt = this.add.text(x, y-30, `-${dmg}`, { font: '24px Arial', fill: '#ff4444', stroke: '#000', strokeThickness: 3 }).setDepth(200);
  this.tweens.add({
    targets: txt,
    y: y-60,
    alpha: 0,
    duration: 700,
    onComplete: () => txt.destroy()
  });
}

function tryDropChest(x, y) {
  if (Math.random() < 0.15) {
    const chest = chests.create(x, y, 'chest');
    chest.setSize(32, 32);
    chest.setDisplaySize(32, 32);
    chest.type = null;
  }
}

function onPlayerGetChest(player, chest) {
  if (!player || !chest || !chest.active) return;
  let rewardType = Phaser.Math.Between(0, 5);
  if (rewardType < 5) {
    const perk = perkNames[rewardType];
    perks[perk]++;
    if (perk === 'maxHp') {
      playerStats.maxHp += 20;
      playerStats.hp += 20;
    } else if (perk === 'speed') {
      playerStats.speed += 20;
    }
  } else {
    ownedWeapons.laser = true;
    if (weaponLevels.laser < 5) weaponLevels.laser++;
  }
  updateHudPerkWeapon();
  showDamageText.call(this, chest.x, chest.y, '획득!', '#0f0');
  if (chest.graphics && chest.graphics.destroy) chest.graphics.destroy();
  chest.destroy && chest.destroy();
}

function getWeaponDamage(type) {
  let base = (type === 'gun') ? 20 : 40;
  if (type === 'laser') base *= (1 + 0.1 * (weaponLevels.laser-1));
  base *= (1 + 0.1 * perks.damage);
  return Math.round(base);
}

function updateHudPerkWeapon() {
  let perkStr = '특전: ';
  for (const k of perkNames) {
    if (perks[k] > 0) perkStr += `${perkDisplay[k]} Lv.${perks[k]}  `;
  }
  if (perkStr === '특전: ') perkStr += '없음';
  hudPerkText.setText(perkStr);
  let weaponStr = '무기: ';
  if (ownedWeapons.gun) weaponStr += `권총 Lv.1`;
  if (ownedWeapons.laser && weaponLevels.laser > 0) weaponStr += `, 레이저 Lv.${weaponLevels.laser}`;
  hudWeaponText.setText(weaponStr);
}

function safePlaySound(scene, key) {
  try {
    if (scene.sound.get(key)) {
      scene.sound.play(key);
    }
  } catch(e) {
  }
}

new Phaser.Game(config); 