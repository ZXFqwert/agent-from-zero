import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameState, ScenarioDefinition } from "./engine/types";

type SceneArt = NonNullable<ScenarioDefinition["art"]>;
function sceneArt(scenario: ScenarioDefinition): SceneArt {
  return scenario.art ?? (scenario.location === "warehouse" ? "warehouse" : "harbor");
}
function sceneTexture(scenario: ScenarioDefinition, state: GameState): string {
  const art = sceneArt(scenario);
  if (art === "warehouse") return state.world.gate === true || !("gate" in state.world) ? "warehouse-open" : "warehouse";
  if (art === "ferry") {
    if (state.world.boatAt === "far") return state.world.cargoLoaded === true || state.world.cargoDelivered === true ? "ferry-far" : "ferry-far-empty";
    return state.world.cargoLoaded === true ? "ferry-loaded" : "ferry";
  }
  return art;
}

/** React owns simulation. Persistent visuals derive only from committed world facts. */
export default function Scene({ state, scenario, reducedMotion }: {
  state: GameState; scenario: ScenarioDefinition; reducedMotion: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const latest = useRef({ state, scenario, reducedMotion });
  latest.current = { state, scenario, reducedMotion };
  useEffect(() => {
    let liveScene: Harbor | undefined;
    class Harbor extends Phaser.Scene {
      background!: Phaser.GameObjects.Image;
      oldBackground!: Phaser.GameObjects.Image;
      echo!: Phaser.GameObjects.Image;
      phantom!: Phaser.GameObjects.Image;
      glow!: Phaser.GameObjects.Graphics;
      previousCount = 0;
      previousScenario = "";
      preload() {
        for (const [key, file] of [
          ["harbor", "harbor-background"], ["warehouse", "warehouse-background"],
          ["warehouse-open", "warehouse-open-background"], ["tide", "tide-background"],
          ["ferry", "ferry-background"], ["ferry-far", "ferry-far-background"],
          ["ferry-far-empty", "ferry-far-empty-background"], ["ferry-loaded", "ferry-loaded-background"],
          ["echo", "echo-companion"], ["phantom", "hollow-herald"],
          ["forge", "forge-background"], ["clerk", "paper-clerk"],
          ["clock", "clock-background"], ["warden", "endless-warden"],
          ["archive", "archive-background"], ["keeper", "palimpsest-keeper"],
          ["corridor", "corridor-background"], ["archivist", "many-faced-archivist"],
        ]) {
          const allowed=({1:['harbor','warehouse','warehouse-open','tide','ferry','ferry-far','ferry-far-empty','ferry-loaded','phantom'],2:['forge','clerk'],3:['clock','warden'],4:['corridor','archivist'],5:['archive','keeper']} as Record<number,string[]>)[latest.current.scenario.chapter]??[];
          if(key!=='echo'&&!allowed.includes(key))continue;
          this.load.image(key, `${import.meta.env.BASE_URL}art/${file}.webp`);
        }
      }
      create() {
        liveScene = this;
        this.background = this.add.image(0, 0, sceneTexture(latest.current.scenario,latest.current.state)).setOrigin(0.5, 0);
        this.oldBackground = this.add.image(0, 0, sceneTexture(latest.current.scenario,latest.current.state)).setOrigin(0.5, 0).setAlpha(0);
        this.glow = this.add.graphics();
        this.phantom = this.add.image(0, 0, latest.current.scenario.chapter===5?"keeper":latest.current.scenario.chapter===4?"archivist":latest.current.scenario.chapter===3?"warden":latest.current.scenario.chapter===2?"clerk":"phantom");
        this.echo = this.add.image(0, 0, "echo").setOrigin(0.5, 1);
        if (!latest.current.reducedMotion) {
          this.tweens.add({ targets: this.echo, angle: { from: -1, to: 1 }, duration: 2400, yoyo: true, repeat: -1, ease: "Sine.inOut" });
          for (let i = 0; i < 10; i++) {
            const star = this.add.circle((((i * 83) % 400) / 400) * this.scale.width, (((i * 137) % 380) / 380) * this.scale.height, 1.2, 0xe6d2a0, 0.35);
            this.tweens.add({ targets: star, alpha: 0.04, y: star.y - 25, duration: 2600 + i * 171, repeat: -1, yoyo: true });
          }
        }
        this.scale.on("resize", () => this.paint());
        this.paint();
      }
      aura(x: number, y: number, color: number, size = 1) {
        for (let j = 5; j > 0; j--) this.glow.fillStyle(color, 0.018 + (5 - j) * 0.014).fillCircle(x, y, (8 + j * 6) * size);
        this.glow.fillStyle(color, 0.85).fillCircle(x, y, 3.5 * size);
      }
      ring(x: number, y: number, color: number, radius = 15) {
        this.glow.lineStyle(1.5, color, 0.7).strokeCircle(x, y, radius);
        this.glow.lineStyle(1, color, 0.2).strokeCircle(x, y, radius + 5);
      }
      pulse(x: number, y: number, color: number, radius = 16) {
        const circle = this.add.circle(x, y, radius).setStrokeStyle(2, color, 0.85);
        this.tweens.add({ targets: circle, scale: 2.7, alpha: 0, duration: 650, ease: "Sine.out", onComplete: () => circle.destroy() });
      }
      paint() {
        if (!this.background) return;
        const { state: s, scenario: q, reducedMotion: reduce } = latest.current;
        const w = this.scale.width, h = this.scale.height, backdropHeight = Math.max(h, w * 1.5);
        const art = sceneArt(q), boss = q.kind === "boss", changedScenario = this.previousScenario !== q.id;
        const px = (x: number) => x * w, py = (y: number) => y * backdropHeight;
        // Reported facts never change the depicted world.
        const texture = sceneTexture(q, s);
        if (this.background.texture.key !== texture) {
          this.tweens.killTweensOf(this.oldBackground);
          this.oldBackground.setTexture(this.background.texture.key).setAlpha(changedScenario || reduce ? 0 : 1);
          this.background.setTexture(texture);
          if (!changedScenario && !reduce) this.tweens.add({ targets: this.oldBackground, alpha: 0, duration: 520 });
        }
        this.background.setPosition(w / 2, 0).setDisplaySize(w, backdropHeight).setTint(boss ? 0xadb6d5 : 0xffffff);
        this.oldBackground.setPosition(w / 2, 0).setDisplaySize(w, backdropHeight).setTint(boss ? 0xadb6d5 : 0xffffff);
        this.echo.setPosition(w * (boss || art === "ferry" ? 0.23 : 0.28), h * 0.8).setDisplaySize(w * 0.28, w * 0.315);
        this.phantom.setVisible(boss && s.status !== "won").setPosition(w * 0.65, h * (art === "archive"?0.47:0.39)).setDisplaySize(w * (art === "clock"?0.5:art === "forge"?0.43:0.53), w * ((art === "corridor"||art === "archive")?0.8:art === "clock"?0.557:art === "forge"?0.645:0.555));
        this.phantom.setAlpha(Math.max(0.35, 1 - s.verifiedGoals.length * 0.28));
        this.glow.clear();
        if(art==='archive') {
          const count=s.memory?.entries.filter(e=>e.status==='active').length??0;
          for(let i=0;i<count;i++)this.ring(px(0.42+i*0.1),py(0.37),0xe3bc78,9);
          if(s.memory?.queue)this.aura(px(0.55),py(0.55),0x93dbc3,1.2);
          if(s.world.pressure===true)this.aura(px(0.72),py(0.58),0xcc875d,1.3);
          if(q.goals.every(g=>s.world[g.fact]===g.equals))this.aura(px(0.51),py(0.43),0x9dd4bc,1.6);
        }
        if(art==='corridor') {
          const restored=q.goals.filter(g=>s.world[g.fact]===g.equals).length;
          this.glow.lineStyle(2,restored?0x9cdcc7:0xb5a3df,0.6).strokeCircle(px(0.5),py(0.12),w*0.12);
          for(let i=0;i<(s.context?.activeIds.length??0);i++){this.glow.fillStyle(0xdbc090,0.9).fillRoundedRect(px(0.14)+i*18,h*0.67,13,21,2);}
          if(restored)this.aura(px(0.5),py(0.48),0x9cdcc7,1.4);
          if(boss)for(let i=0;i<q.goals.length;i++)if(!s.verifiedGoals.includes(q.goals[i].fact))this.ring(px(0.6+i*0.07),h*0.29,0xb5a3df,9);
        }
        if(art==='clock') {
          const cx=px(0.5),cy=py(0.135),angle=(s.runtime?.toolCalls??0)*0.42;
          const spinning=s.world.ritualActive!==false && s.world.turnstileStopped!==true;
          this.glow.lineStyle(2,spinning?0xd9b373:0x95d7c3,0.85).beginPath().moveTo(cx,cy).lineTo(cx+Math.sin(angle)*w*0.095,cy-Math.cos(angle)*w*0.095).strokePath();
          this.glow.lineStyle(3,0xd9b373,0.9).beginPath().moveTo(cx,cy).lineTo(cx+Math.sin(angle/12)*w*0.065,cy-Math.cos(angle/12)*w*0.065).strokePath();
          if(!spinning)this.ring(cx,cy,0x95d7c3,w*0.13);
          for(const [fact,x]of [['gearsLubricated',0.22],['balanceTuned',0.38],['pulseDelivered',0.5],['sealRestored',0.62],['residentsSafe',0.8]] as const)if(s.world[fact]===true)this.aura(px(x),h*0.55,0x95d7c3,0.6);
          if(boss)for(let i=0;i<q.goals.length;i++)if(!s.verifiedGoals.includes(q.goals[i].fact))this.ring(px(0.58+i*0.06),h*0.3,0xba9be0,9);
        }
        if(art==='forge') {
          // These are visible physical objects; the policy still only reads its received context.
          if('depotCrates' in s.world)for(const [fact,x] of [['depotCrates',0.64],['clinicCrates',0.87]] as const) {
            for(let i=0;i<Number(s.world[fact]);i++) {
              const cx=px(x),cy=h*0.58-i*18;
              this.glow.fillStyle(fact==='clinicCrates'?0xb8d3b3:0xc8a475,0.9).fillRoundedRect(cx-9,cy-9,18,16,2);
              this.glow.lineStyle(1,0x533e2c,0.8).strokeRect(cx-7,cy-7,14,12);
            }
          }
          if(s.world.coolantReady===true)this.aura(px(0.22),py(0.19),0x91dedc);
          if(s.world.furnaceSafe===true)this.ring(px(0.22),py(0.19),0x91dedc,27);
          for(const [fact,x] of [['frontOpen',0.3],['northValve',0.44],['southValve',0.59],['documentStamped',0.72]] as const)if(s.world[fact]===true)this.aura(px(x),h*0.48,0xf1d18b,0.7);
          if(boss)for(let i=0;i<q.goals.length;i++)if(!s.verifiedGoals.includes(q.goals[i].fact)) {
            this.glow.fillStyle(0xe9ddc1,0.7).fillRoundedRect(px(0.58)+i*13,h*0.35+i*8,26,34,2);
            this.glow.lineStyle(1,0x716451,0.6).strokeRect(px(0.58)+i*13+5,h*0.35+i*8+8,15,2);
          }
        }
        if (art === "harbor") {
          const lamps: [boolean, number, number][] = boss
            ? [[s.world.westLight === true, 0.24, 0.2], [s.world.eastLight === true, 0.76, 0.2]]
            : [[s.world.light === true, 0.5, 0.095]];
          for (const [lit, x, y] of lamps) if (lit) {
            this.aura(px(x), py(y), 0xffd27b, 1.1);
            this.glow.fillStyle(0xffd78b, 0.12).fillTriangle(px(x), py(y), w, py(y + 0.1), w, py(y - 0.04));
          }
          for (const [i, fact] of ["bellOne", "bellTwo", "bellThree"].entries()) if (s.world[fact] === true) {
            this.aura(px(0.3 + i * 0.2), py(0.32), 0x8edcca, 0.7);
            this.ring(px(0.3 + i * 0.2), py(0.32), 0x8edcca, 10);
          }
          if (s.world.heardAcrossFog === true) this.aura(px(0.76), py(0.2), 0xffdc8d, 1.2);
        }
        if (art === "warehouse") {
          if (s.world.gate === true) this.aura(px(0.59), py(0.37), 0xffd894, 1.2);
          if (Number(s.world.clinicCrates) > 0) this.aura(px(0.5), py(0.5), 0x9be0b8, 0.8);
          if (Number(s.world.dockCrates) > 0) this.aura(px(0.17), py(0.34), 0x9be0b8, 0.8);
          if (s.world.cartLoaded === true) this.ring(px(s.world.cartAt === "midway" ? 0.43 : 0.3), py(0.59), 0xf0cf8b);
        }
        if (art === "tide") {
          // Mark the actual chosen route, without revealing hidden currentSafeRoute.
          const routeX = s.world.routeSign === "north" ? 0.35 : s.world.routeSign === "south" ? 0.66 : null;
          if (routeX !== null) {
            this.ring(px(routeX), py(0.37), 0xe2c598, 13);
            this.glow.lineStyle(2, 0xe2c598, 0.6).beginPath().moveTo(px(routeX), py(0.42)).lineTo(px(routeX), py(0.46)).strokePath();
          }
          if (s.world.channelOpen === true) this.aura(px(routeX ?? 0.5), py(0.42), 0x8ad6c0, 1.05);
          if (s.world.trialReturned === true) this.ring(px(0.52), py(0.53), 0x8ad6c0);
          if (s.world.tidePassed === true) for (let i = 0; i < 4; i++) {
            this.glow.lineStyle(1.3, 0x99d8e6, 0.25).beginPath().moveTo(px(0.23), py(0.43 + i * 0.018)).lineTo(px(0.79), py(0.43 + i * 0.018)).strokePath();
          }
          if (s.world.bridgeStable === false) {
            this.glow.lineStyle(2.5, 0x241e20, 0.9).beginPath().moveTo(px(0.49), py(0.29)).lineTo(px(0.48), py(0.32)).lineTo(px(0.51), py(0.35)).lineTo(px(0.49), py(0.38)).strokePath();
          } else if (s.world.bridgeStable === true && s.world.tidePassed === true) this.ring(px(0.5), py(0.34), 0x8ad6c0, 20);
          if (s.world.cargoDelivered === true) this.aura(px(0.7), py(0.3), 0xffdb93, 1.05);
        }
        if (art === "ferry") {
          const far = s.world.boatAt === "far";
          if (s.world.cargoLoaded === true && !far) {
            this.aura(px(0.58), py(0.49), 0xe8c793, 0.8);
            if (s.world.cargoSecured === true) this.ring(px(0.58), py(0.49), 0x8ad6c0, 19);
          }
          if (far) this.aura(px(0.82), py(0.31), s.world.cargoDelivered === true ? 0xffdc94 : 0x9cd0d7, 0.85);
        }
        const newEvents = changedScenario ? [] : s.events.slice(this.previousCount);
        if (newEvents.length && !reduce) {
          const won = newEvents.some((event) => event.type === "victory");
          const changedWorld = newEvents.some((event) => event.type === "world-change");
          const falseReport = newEvents.some((event) => event.type === "untrusted-message");
          if (won) this.cameras.main.flash(550, 255, 231, 165);
          else if (changedWorld) {
            this.pulse(px(0.5), h * 0.4, 0xe6b676, 26);
            this.cameras.main.shake(180, 0.003);
          } else if (newEvents.some((event) => event.type === "verified" && event.success)) this.pulse(px(boss ? 0.64 : 0.5), h * 0.4, 0x8ad6c0, 22);
          if (falseReport && boss) this.pulse(this.phantom.x, this.phantom.y, 0xb39ce5, 26);
          if (newEvents.some((event) => event.type === "observation" || event.type === "result")) {
            const failed = newEvents.some((event) => event.type === "result" && !event.success);
            this.pulse(this.echo.x, this.echo.y - w * 0.12, failed ? 0xe0a36e : 0x95d7c3, 13);
          }
        }
        this.previousCount = s.events.length;
        this.previousScenario = q.id;
      }
    }
    const renderer = new Phaser.Game({ type: Phaser.AUTO, parent: element.current!, transparent: true, width: element.current!.clientWidth, height: element.current!.clientHeight, scene: Harbor, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, audio: { noAudio: true }, banner: false, render: { antialias: true, pixelArt: false }, fps: { target: 30 } });
    game.current = renderer;
    const render = () => liveScene?.paint();
    renderer.events.on("echo-state", render);
    return () => { renderer.events.off("echo-state", render); renderer.destroy(true); game.current = null; };
  }, [scenario.chapter]);
  useEffect(() => { game.current?.events.emit("echo-state"); }, [state, scenario, reducedMotion]);
  const statusText = state.status === "won" ? "真实目标已验收" : state.status === "running" ? "回声正在行动" : "回声等待你的下一步指令";
  const visibleChange = sceneArt(scenario) === "ferry" && state.world.boatAt === "far" ? "，渡船已到达远岸" : sceneArt(scenario) === "warehouse" && state.world.gate === true ? "，仓库门已经开启" : "";
  const fallback = sceneTexture(scenario, state);
  return <div ref={element} className="phaser-scene" role="img" aria-label={`${scenario.title}。${statusText}${visibleChange}。`} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}art/${fallback}-background.webp)`, backgroundSize: "100% auto", backgroundPosition: "center top", backgroundRepeat: "no-repeat" }} />;
}
