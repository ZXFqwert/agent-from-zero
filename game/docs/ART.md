# 第一段冒险美术资产

制作日期：2026-10-02。所有图像均由内置 `image_gen__imagegen` 生成，并由 `view_image` 实际查看；未使用外部图库、API/CLI 回退或手绘占位图。项目 `art-source/` 保存原始 PNG，默认生成目录的原件保留。`public/art/` 仅保留发布用 WebP。

统一美术：手绘奇幻港城；墨蓝、海青夜色与旧铜、琥珀暖光；有磨损的石、木、金属与羊皮纸。文字和游戏状态由界面层绘制，图像不含文字。背景是 2:3 竖构图，可配合画布裁切；角色是透明 PNG。

| 原始文件（相对 art-source） | 像素 | 模式 | 字节 | 用途 |
|---|---:|---|---:|---|
| harbor-background.png | 1024×1536 | RGB | 2844463 | 熄灭灯塔，前景可放角色 |
| echo-companion.png | 1182×1330 | RGBA | 1643578 | 回声，正面偏右，全身 |
| workshop-background.png | 1024×1536 | RGB | 2898311 | 工坊工作台与伙伴装配 |
| hollow-herald.png | 1226×1283 | RGBA | 1619378 | 虚报成功的幻影首领 |
| warehouse-background.png | 1024×1536 | RGB | 3407362 | 仓库门关闭状态 |
| warehouse-open-background.png | 1024×1536 | RGB | 3133658 | 同一仓库门开启状态 |

透明角色的 alpha 范围均经检查为 0–255。图片中的黑色预览背景不在资产中。六张原始 PNG 合计约 15.55 MB。没有烧录文字，因此正文可访问性、中文排版与本地化独立于美术。

## 发布格式

使用本机已有 Pillow WebP 编解码器做纯格式转码：`quality=82, method=6, exact=True`；不缩放、不裁切、不改色、不修改语义内容。RGB 有损压缩，**不宣称像素无损**；两个角色的 alpha 通道逐像素比较与 PNG 完全相同。原始 PNG 先复制到 `art-source/`，逐字节核对后才从 `public/art/` 移除，避免 Vite 重复发布原稿。

| 发布文件（相对 public/art） | 字节 |
|---|---:|
| harbor-background.webp | 242274 |
| echo-companion.webp | 242566 |
| workshop-background.webp | 287024 |
| hollow-herald.webp | 344548 |
| warehouse-background.webp | 391834 |
| warehouse-open-background.webp | 345458 |

发布图像合计 1853704 字节，约 1.77 MiB，相比原始 PNG 减少约 88%。尺寸、构图与透明度保留。下方提示词与 SHA-256 对应归档 PNG，便于追溯生成原件。

## 场景接入提示

- 港口：灯塔约在图像坐标 (0.5, 0.18)；控制柱约 (0.86, 0.59)；电源箱与线缆约 (0.1, 0.59)。底部石码头留给回声。原图灯塔无光，点亮后的光束与光晕由游戏表现层根据已提交的世界状态显示。
- 仓库：门中心约 (0.58, 0.35)，控制器 (0.92, 0.34)，电缆 (0.25, 0.53)。开门前后背景保留同样布局，建议短暂交叉淡入；开门条件由内核决定。
- 回声：小型象牙石魔像，海青围巾，青眼，胸口琥珀灯，铜工具包；不建议对精灵做过多缩放晃动，以免损害阅读性。
- 首领：象牙笑脸、空白羊皮纸、海军蓝与紫色烟雾；面具适合承接护盾破裂光效，血量和提示由界面单独绘制。

## 原始提示词与来源

### harbor-background.png

生成模式：新生成，`transparent_background=false`。

> Use case: illustration-story. Production game asset, a vertical 2:3 hand-painted 2D environment plate for an original fantasy mobile adventure called Echo Workshop. No text or UI. A magical old harbor at blue hour, a tall ancient ivory-stone lighthouse near horizontal center and upper middle, its lantern chamber clearly dark/unlit. Small amber village windows beyond sea, aged copper machinery, teal water, warm muted stone, moody ink-blue sky, distant misty cliff. Foreground lower quarter is a broad stone quay with wooden crates and a brass control pedestal at right, unobstructed central space where a separate character sprite can stand. Storybook gouache with rich painterly material texture, crisp thoughtful silhouettes, convincing depth, cinematic yet charming and inviting, illustrated independent adventure game quality. Vertical composition with strong readable important objects at phone size. Three primary interaction landmarks must be visually distinct: lighthouse upper center, brass control pedestal on right foreground, coiled cable and small copper power box on left foreground. Painterly teal-blue night and restrained warm amber. No characters, no lettering, no symbols that look like text, no overlays, no interface, no watermark. Lighthouse must remain visibly unlit, no beam from lighthouse.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-368ab1a4-fd9a-4399-aa8f-51ef8af6c3c3.png`。

SHA-256: `423fcad6ba62ed42be7b9af6d17c75bb00bee0027e832cb9ee221e837901e703`。

### echo-companion.png

生成模式：新生成，`transparent_background=true`。

> Use case: stylized-concept. Production 2D mobile fantasy adventure character sprite, original companion named Echo, a small lovable stone automaton. ONE full-body character alone on genuinely transparent background, centered with generous margin, no props outside its body. Compact rounded weathered ivory stone body, short sturdy articulated limbs, oversized rounded head with two bright turquoise eye apertures and curious gentle expression, small amber heart lantern set in bronze chest frame, deep teal scarf with two short trailing ends, brass engineer tool satchel on hip. Tiny chips and gouache material textures, charming but not babyish, sophisticated indie fantasy game painterly illustration, muted warm ivory / deep teal / antique brass. Front three-quarter stance facing slightly right, relaxed hands, feet fully visible and planted at same ground line, high silhouette readability at 100px display size. Directional soft warm light top left and subtle cool ambient light. No floor or cast floor shadow, no environment, no text, no border, no watermark, no UI, no multiple views. True transparent alpha background.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-1e6b9ab9-d695-407e-be69-dcb43212dfe8.png`。

SHA-256: `aeacc5996bc13289999a9bf95fa9bbf05ea45d81e416dc92a37c9463e942e8eb`。

### workshop-background.png

生成模式：新生成，`transparent_background=false`。

> Use case: illustration-story. Production game environment plate for an original fantasy mobile adventure Echo Workshop. Vertical 2:3 composition, matching a rich painterly teal and antique amber old harbor fantasy. Interior of an inherited magical engineer's workshop, beautifully tactile aged wooden workbench across lower middle, six clear separate work areas represented by empty parchment, brass lens, old pliers, looped copper wire, rolled ribbon contract, small wooden archive drawer. Soft amber lamp on left, tall arched window upper center looking out to blue harbor lighthouse silhouette, shelves packed with ceramic vessels and brass parts to either side. Gentle dust motes, magical glimmers, worn cozy home base, sense of discovery and craft. Lower foreground has open floor area for a separate small golem sprite. Storybook gouache / finely painted independent adventure game quality, sophisticated details and strong readable forms. No characters, no text, no legible runes or labels, no UI, no border, no watermark. Teal shadows, warm ochre highlights, brass, old paper and honey wood. Avoid overclutter in lower center and avoid anything resembling modern screens.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-f29860ef-1890-4d64-996e-f4561e439934.png`。

SHA-256: `0afbc0a8a14718a02c0068400f3187dc07ee9f66ddf876d306c95dae674428aa`。

### hollow-herald.png

生成模式：新生成，`transparent_background=true`。

> Use case: stylized-concept. ONE transparent isolated 2D fantasy adventure game enemy sprite, the original 'Hollow Herald', a mysterious small floating phantom made of ornate antique brass masks and blank torn parchments, a handsome smiling ivory theater mask suspended at its core, three slightly smaller blank mask shards orbiting near shoulders. Deep navy and muted violet ragged spectral cloak fades into twisting smoky ribbon tips, icy violet gleam in hollow eye openings, restrained golden seals on blank parchment ribbons. Boss embodies false reports and illusion, feels unsettling and clever, suitable for a thoughtful all-ages indie fantasy adventure, no gore or horror. Exquisite hand-painted gouache textures, strong elegant readable silhouette, painterly material detail matching a blue-hour teal harbor and warm antique brass fantasy setting. Full figure centered front three-quarter facing slightly left, entirely visible with transparent margin. No background, no floor, no props away from figure, no text or writing, no symbols resembling letters, no UI, no frames, no watermark. Preserve genuine transparent alpha, light ethereal smoke confined to silhouette.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-56805cee-6521-426f-9284-2fedd9b66024.png`。

SHA-256: `bf1f17b4420574243bce03a2cae23d8b5444cd4c5af0a2165cf46fae111d0eeb`。

### warehouse-background.png

生成模式：新生成，`transparent_background=false`。

> Use case: illustration-story. A production 2D game environment plate for an original fantasy mobile adventure, vertical 2:3. View from outside an old harbor warehouse at blue hour. A large visibly shut aged wooden double gate dominates middle center, iron bands and brass locking mechanism. Stone arch above, ivy and wet weathered bricks, warm amber wall lanterns, deep teal shadows, maritime ropes and crates. A distinct small brass mechanical gate control is on right wall about midway up, and a separate coil of copper power cable with a disconnected plug beside small power box is low left. Foreground lower quarter open cobblestone area for an added character sprite. Enchanted old-city architecture, exquisite tactile hand-painted storybook gouache with cinematic material detail, inviting adventurous mood, same restrained teal-blue / brass-amber / muted ivory palette as a nighttime fantasy lighthouse harbor. Main gate must be clearly closed. Strong object readability at phone display size, pleasing framing and depth, soft faint magic glow only in lanterns. No characters, no words, no labels, no symbols resembling lettering, no UI, no border, no watermark.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-c7d82226-a5ce-426b-a7fc-bca5d36b3d03.png`。

SHA-256: `3737697e69661da6ad8bef86df04fa07fb486a9046f5a5115567aa3710b578e4`。

### warehouse-open-background.png

生成模式：编辑，引用本项目 `warehouse-background.png`；已在编辑前以 `view_image` 查看，`transparent_background=false`。

> Precise game environment state edit. This reference is the CLOSED state of a game warehouse gate. Create the OPEN state of exactly this same game environment: open both central wooden gate leaves inward, reveal a warmly amber-lit warehouse interior with stacked sacks and wooden crates and a clear central passage. Preserve the exact camera framing, resolution/aspect, exterior architecture, gate arch, side lamps, cable on lower left, brass wall control on right, cobblestone foreground, blue harbor buildings, colors, painterly material style, perspective, and all other details. Change only the opening state of the two wooden gate doors and the now-visible interior behind them. Leave every area outside the gate unchanged. No characters, no text, no UI, no watermark. This must work as a before/after state transition in one static game scene.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-f02d5c6f-5606-4d93-b8d2-99ea3930aa42.png`。

SHA-256: `7c6cc28d75947c47b683f2c1c7cccd0a04263c448211787fb755f4dc6ca013a7`。

## 验证界限

已验证文件存在、尺寸、颜色模式、透明度与人工视觉内容。未在本任务内验证真实手机上的最终裁切、性能或动画，需由页面集成与真机体验进一步检查。首领与回声目前为静态透明精灵，位移、呼吸、光晕与攻击效果应由表现层制作；不能宣称已有逐帧动画。
