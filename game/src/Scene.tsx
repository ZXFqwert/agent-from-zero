import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameState, ScenarioDefinition } from "./engine/types";

/** React owns simulation; the Phaser bridge only receives renderable snapshots. */
export default function Scene({
  state,
  scenario,
  reducedMotion,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  reducedMotion: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    game = useRef<Phaser.Game | null>(null);
  const latest = useRef({ state, scenario, reducedMotion });
  latest.current = { state, scenario, reducedMotion };
  useEffect(() => {
    let liveScene: Harbor | undefined;
    class Harbor extends Phaser.Scene {
      background!: Phaser.GameObjects.Image;
      echo!: Phaser.GameObjects.Image;
      phantom!: Phaser.GameObjects.Image;
      glow!: Phaser.GameObjects.Graphics;
      previousCount = 0;
      previousVerified = 0;
      preload() {
        for (const [key, file] of [
          ["harbor", "harbor-background"],
          ["warehouse", "warehouse-background"],
          ["warehouse-open", "warehouse-open-background"],
          ["echo", "echo-companion"],
          ["phantom", "hollow-herald"],
        ])
          this.load.image(key, `${import.meta.env.BASE_URL}art/${file}.webp`);
      }
      create() {
        liveScene = this;
        this.background = this.add.image(0, 0, "harbor").setOrigin(0.5, 0);
        this.glow = this.add.graphics();
        this.phantom = this.add.image(0, 0, "phantom");
        this.echo = this.add.image(0, 0, "echo").setOrigin(0.5, 1);
        if (!latest.current.reducedMotion) {
          this.tweens.add({
            targets: this.echo,
            angle: { from: -1, to: 1 },
            duration: 2400,
            yoyo: true,
            repeat: -1,
            ease: "Sine.inOut",
          });
          for (let i = 0; i < 13; i++) {
            const star = this.add.circle(0, 0, 1.5, 0xe6d2a0, 0.45);
            star.setPosition(
              (((i * 83) % 400) / 400) * this.scale.width,
              (((i * 137) % 380) / 380) * this.scale.height,
            );
            this.tweens.add({
              targets: star,
              alpha: 0.08,
              y: star.y - 30,
              duration: 2600 + i * 171,
              repeat: -1,
              yoyo: true,
            });
          }
        }
        this.scale.on("resize", () => this.paint());
        this.paint();
      }
      paint() {
        if (!this.background) return;
        const { state: s, scenario: q, reducedMotion: reduce } = latest.current;
        const w = this.scale.width,
          h = this.scale.height,
          boss = q.location === "boss";
        this.background.setTexture(
          q.location === "warehouse"
            ? s.world.gate
              ? "warehouse-open"
              : "warehouse"
            : "harbor",
        );
        this.background
          .setPosition(w / 2, 0)
          .setDisplaySize(w, Math.max(h, w * 1.5));
        this.background.setTint(boss ? 0xadb6d5 : 0xffffff);
        this.echo
          .setPosition(w * (boss ? 0.23 : 0.28), h * 0.8)
          .setDisplaySize(w * 0.28, w * 0.315);
        this.phantom
          .setVisible(boss && s.status !== "won")
          .setPosition(w * 0.65, h * 0.39)
          .setDisplaySize(w * 0.53, w * 0.555);
        this.phantom.setAlpha(
          Math.max(0.35, 1 - s.verifiedGoals.length * 0.28),
        );
        this.glow.clear();
        const lit = q.goals.filter((g) => s.world[g.fact] === g.equals).length;
        if (lit) {
          const points = boss
            ? [
                [0.24, 0.3],
                [0.76, 0.3],
              ].slice(0, lit)
            : [[0.5, q.location === "warehouse" ? 0.37 : 0.15]];
          points.forEach(([x, y]) => {
            for (let j = 6; j > 0; j--)
              this.glow
                .fillStyle(0xffd27b, 0.02 + (6 - j) * 0.015)
                .fillCircle(w * x, h * y, 14 + j * 7);
            this.glow.fillStyle(0xffe4a1, 0.9).fillCircle(w * x, h * y, 6);
            this.glow
              .fillStyle(0xffd78b, 0.12)
              .fillTriangle(w * x, h * y, w, h * (y + 0.14), w, h * (y - 0.06));
          });
        }
        if (q.location === "warehouse" && s.world.gate) {
          this.glow
            .fillStyle(0xffd894, 0.14)
            .fillRect(w * 0.35, h * 0.31, w * 0.35, h * 0.24);
        }
        if (s.events.length > this.previousCount && !reduce) {
          const last = s.events[s.events.length - 1];
          if (last?.type === "victory") {
            this.cameras.main.flash(700, 255, 231, 165);
          } else if (s.verifiedGoals.length > this.previousVerified) {
            this.cameras.main.flash(220, 98, 194, 180);
            this.cameras.main.shake(150, 0.003);
          } else if (last?.type === "observation" || last?.type === "result") {
            this.tweens.add({
              targets: this.echo,
              alpha: 0.7,
              duration: 180,
              yoyo: true,
            });
          }
        }
        this.previousCount = s.events.length;
        this.previousVerified = s.verifiedGoals.length;
      }
    }
    const renderer = new Phaser.Game({
      type: Phaser.AUTO,
      parent: element.current!,
      transparent: true,
      width: element.current!.clientWidth,
      height: element.current!.clientHeight,
      scene: Harbor,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
      banner: false,
      render: { antialias: true, pixelArt: false },
      fps: { target: 30 },
    });
    game.current = renderer;
    const render = () => liveScene?.paint();
    renderer.events.on("echo-state", render);
    return () => {
      renderer.events.off("echo-state", render);
      renderer.destroy(true);
      game.current = null;
    };
  }, []);
  useEffect(() => {
    game.current?.events.emit("echo-state");
  }, [state, scenario, reducedMotion]);
  return (
    <div
      ref={element}
      className="phaser-scene"
      role="img"
      aria-label={`${scenario.title}。${state.status === "won" ? "真实目标已验收。" : "回声正在等待你的指令。"}`}
    />
  );
}
