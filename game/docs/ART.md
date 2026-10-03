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


## 正式第一章追加素材

2026-10-02 追加潮汐泵房与渡船场景。全部使用内置 imagegen，透明参数均为 false，编辑输入与输出均以 view_image 检查。原件保存在 art-source/，发布图保存在 public/art/；均为 1024×1536 RGB。用工作区依赖包中的 Sharp 纯转码 WebP（quality 82，effort 6），不缩放、不裁切。每张均小于 550 KB。

渡船额外制作装货、空船远岸、载货远岸三种状态，避免让“船到了”在画面上冒充“药箱已交付”。Scene 的持久状态只使用 state.world；untrusted-message 仅有紫色波纹，不能改变灯、桥或货物位置。currentSafeRoute 不被画成免费正确答案，航牌只显示玩家实际选择。

### tide-background.png / .webp

模式：新场景生成；harbor-background.png 只作画风参考。发布体积：322512 字节。

> Use case: illustration-story. Create a NEW original environment plate for the next scene of the same 2D fantasy mobile adventure as the reference. Reference image is STYLE AND PALETTE ONLY, not a scene to preserve. Portrait 2:3. A harbor tidal measuring station and old pump house beside a small ancient stone bridge at blue hour. Strong readable arrangement: central low stone bridge spans a channel, two clearly distinct water passages splitting left and right behind it; right middle has a brass handwheel pump and intake pipe on a small stone pump-house facade; left middle has a tall tide gauge made of aged brass with evenly spaced plain ticks but NO numbers or letters, dipping into teal water. A small sheltered wooden lectern with open OLD BLANK parchment logbook is on lower-left quay. Foreground bottom quarter broad empty wet stone platform for a separate knee-high stone golem sprite. Warm amber lamp on bridge, ivy and worn sandstone, moody ink-blue sky, distant harbor village. Finely hand-painted storybook gouache, rich tactile realistic materials but illustrative silhouettes, matching reference teal shadows, warm ochre and antique brass. Keep crucial tide gauge, bridge, lectern and pump clustered in middle/upper two thirds so phone portrait cropping retains them. No characters, no writing, no UI, no labels, no watermark. Avoid turning the old logbook into magical floating text. No lighthouse dominating this composition.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-eda473a7-0975-4998-b49e-f87c953d007e.png`。

PNG SHA-256：`76a9bf3ff4496604ccd6bf8a08849352a48b65cfca93651e2cd241fdec8a1335`。

### ferry-background.png / .webp

模式：新场景生成；harbor-background.png 只作画风参考。发布体积：336450 字节。

> Use case: illustration-story. Create a NEW original vertical 2:3 game environment for the same 2D fantasy mobile adventure, using the provided harbor reference only for painting style, material quality and teal / amber palette. Scene: the last ferry at a quiet fantasy harbor at twilight. A medium small beautiful wooden ferry is moored directly beside an old stone quay, occupying center-right of the middle third, angled into the distance but close enough to clearly see its deck; a rope and mooring post connect it to the near quay. A few wooden medicine crates with unmarked plain ivory cloth bindings wait visibly on the quay beside the boat at middle-left. A warm lantern hangs over the gangplank. Across the teal water a clearly visible distant landing with one warm amber beacon marks the ferry destination. Rich old-city stone architecture, distant moody skyline, blue hour sky with last amber sunset. The foreground bottom quarter is open stone quay with space for a separate knee-high stone golem companion sprite. Hand-painted storybook gouache, exquisite tactile wood/rope/stone, cinematic illustration, inviting wistful adventure, strong readable silhouettes at mobile scale. Composition places boat, crates, rope, gangplank in middle/upper two-thirds so portrait cropping retains all task landmarks. No characters, no letters, no numbers, no labels, no UI, no watermark. Medicine crates must be on near quay, boat empty of cargo initially. No cannon, no modern objects.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-f5cdd8e5-b7aa-40ae-b6c6-15d7de3e511c.png`。

PNG SHA-256：`11ed0f120cf988767997d11c4bd35244e050ee85dbad1a637c763c73549fddd5`。

### ferry-far-background.png / .webp

模式：编辑 ferry-background.png，船与货物抵达远岸。发布体积：311286 字节。

> Precise environment state edit for a game. The provided image is the NEAR SHORE state. Create a FAR SHORE state of exactly the same scene. Move the same covered wooden ferry away from foreground quay to the small distant landing on the upper-right side of the harbor; it should be small from distance but still identifiable as the same boat. Foreground space previously occupied by the boat becomes calm teal harbor water. Pull the gangplank back onto the near quay and coil mooring ropes by the nearest post; remove the specific foreground medicine crates since their cargo has been shipped. Keep exact camera framing, resolution, buildings, sky, water lighting, foreground stone quay, left lantern post, all distant stone structures and overall painterly style. Nothing else changes. No characters, no new text, no UI, no watermark. This is a before/after game background, so exterior invariants must match closely.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-83bb5ef7-2f70-495e-89d3-2b6bf00f118b.png`。

PNG SHA-256：`15efcf23dbc6001b1c51036b339fb57fe97b8bc7e2d1531835a90f21419d58b2`。

### ferry-far-empty-background.png / .webp

模式：编辑 ferry-far-background.png，以 ferry-background.png 作货箱位置参考；空船已到远岸而货箱仍在本岸。发布体积：272710 字节。

> Precise game state edit. Image 1 is the FAR SHORE ferry scene to edit. Image 2 is a supporting reference ONLY for the medicine crate cluster on the near quay. Produce the same FAR SHORE scene as image 1, but restore the original ivory-cloth-wrapped wooden medicine crates at lower-left quay exactly as seen in image 2. This is the game state where the ferry sailed EMPTY and the medicine cargo was accidentally left behind. Keep ferry SMALL at the distant right landing, foreground water empty of boat, and all buildings, sky, lighting, lantern post, wet stone quay, camera and image dimensions unchanged from image 1. Add only the near-shore crate cluster from image 2 at its original position. Do not bring the boat back. No characters, no text or UI. Preserve painterly style and every other detail.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-223bd8a2-dfdd-4602-9e1e-fceeab778dde.png`。

PNG SHA-256：`42064090a91b04bb2c8c658d61659de84300a30c81ce427a1d6d491058688440`。

### ferry-loaded-background.png / .webp

模式：编辑 ferry-background.png，货箱已装上仍在本岸的船。发布体积：299562 字节。

> Precise environment state edit for a game. Use the supplied NEAR SHORE ferry environment unchanged except the medicine crates. Move the group of ivory-cloth-wrapped wooden medicine crates from the lower-left quay onto the deck of the moored wooden ferry at center, behind the small gangplank so they are clearly inside the boat. Remove those crates from the near quay, leaving the stone surface and ropes visible. The ferry remains at the near quay exactly in its existing position; no sailing, no change to background or camera. Preserve exact composition, dimensions, blue-hour lighting, buildings, water, lanterns, wood texture and painterly style. This is the LOADED NEAR SHORE state. No new text, no characters, no UI, no watermark.

默认原件：`E:/CodexState/home/generated_images/01a0fcf6-b2bd-77c2-b703-1ec544c9f1c1/exec-599058ef-38f0-413a-b78e-1b50cded544c.png`。

PNG SHA-256：`8f6d520e552a824ad8be9b9c902f0b7401f171a8dbbf3437291dde4e8a7ea048`。


## 验证界限

已验证文件存在、尺寸、颜色模式、透明度与人工视觉内容。未在本任务内验证真实手机上的最终裁切、性能或动画，需由页面集成与真机体验进一步检查。首领与回声目前为静态透明精灵，位移、呼吸、光晕与攻击效果应由表现层制作；不能宣称已有逐帧动画。

## 第二章原创美术 · 2026-10-03

使用内置 imagegen，实际查看生成图并在手机界面检查。PNG 原件复制入项目，以 Pillow 做 WebP 格式压缩（quality=85, method=6），没有用脚本重绘或抠图。

### forge-background

原稿：`art-source/forge-background.png`；发布：`public/art/forge-background.webp`。尺寸 1024×1536，模式 RGB，透明背景请求 False；发布 274214 字节。

默认原件：`E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-a02906fc-1f92-410b-9d28-26e4a7cb71eb.png`。

PNG SHA-256：`e6ecad118084b22d69b58b6fc0acc93899adf2fe40dec1453db4d486501617f6`。

最终提示词：

> Create an original 2D hand-painted mobile fantasy adventure background for Echo Workshop, chapter 'street of broken instruments'. Portrait composition. A moody small enchanted workshop street at dusk: teal blue stone walls and brass pipes, a glowing copper furnace with cooling pipe upper left, a small wooden medicine-crate hoist and guild counter on the right, two brass pneumatic receipt tubes above a workbench with a few pale blank paper receipts drifting. No characters. Empty usable foreground lower third for a small companion sprite. Expressive storybook gouache and watercolor texture, warm amber golden lamp accents, muted dark petroleum teal and dusty indigo shadows, readable silhouettes, restrained details. Environment occupies full image, cinematic vertical depth, not an isometric diagram or a UI mockup. No text, letters, logos, numbers, watermark or interface. All paper blank. Main central focus a brass workbench with instruments. This background is for a thoughtful Chinese mobile fantasy RPG, charming and mysterious, cozy not horror.

### paper-clerk

原稿：`art-source/paper-clerk.png`；发布：`public/art/paper-clerk.webp`。尺寸 1024×1536，模式 RGBA，透明背景请求 True；发布 384158 字节。

默认原件：`E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-49eafb39-1fa9-47fe-9fb1-5e3d11edc42e.png`。

PNG SHA-256：`9832e48a38acced4a7012f866d8f394fc48ac2480584d4ed1c150b693d36b97b`。

最终提示词：

> Original 2D fantasy mobile RPG enemy sprite, full body, isolated on genuinely transparent background. A magical guild clerk made of folded parchment and drifting blank receipt slips. A crooked brass stamp helmet, small narrow glowing violet eye slits, floating paper robe, bent arms holding a big quill and a wax seal stamp, paper receipt plates orbiting like a shield. Mysterious mischievous bureaucrat, not horror, no human face. Storybook hand-painted gouache and watercolor with fine ink contours. Dusty cream and ochre parchment, dark teal shaded creases, small purple and warm golden magic accents. Single character fills frame vertically, clean readable silhouette, three-quarter front view facing slightly left toward the protagonist, feet and all accessories included. No backdrop, no ground, no shadow outside character, no interface, no letters, words, numbers, logos or watermark; all papers blank. Designed to overlay a moody teal enchanted workshop street. Keep asymmetrical personality and small exaggerated hands.

纸甲书记原稿具有实际 Alpha 通道，保留转换后的透明度。纸盾、库存和光环由 Phaser 按实际世界与验收事实绘制；精灵是静态原画，呼吸/位移与脉冲由场景动画提供，不宣称逐帧手绘动画。

## 第三章原创美术 · 2026-10-03

内置 imagegen 生成并实际查看；Pillow 仅做 WebP 格式压缩（quality=85, method=6）。最终场景在 390×844 浏览器中检查，护盾移至左侧以露出守卫面部。静态精灵叠加程序绘制的指针、能量光环与验收护盾；动画不能改变胜负。

### clock-background

原稿 `art-source/clock-background.png`，发布 `public/art/clock-background.webp`；1024×1536 RGB，透明背景 False，发布 241022 字节。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-24c5e009-1347-418a-be7b-540062b17fe4.png`。PNG SHA-256 `02f68e97396710f916425c0bd75975c3299f3f3e37827c134822355378c48587`。

最终提示词：

> Original 2D hand-painted portrait fantasy RPG environment for 'Echo Workshop: City of Broken Order', chapter 'The Endless Clocktower'. Interior of a huge forgotten brass clocktower at blue twilight: giant worn brass clock mechanism and a round blank clock face high in the upper center, suspended pendulum and layered cogwheels, deep teal masonry arches, warm amber lanterns, an accessible little workbench with a key and oil bottle mid-left, an illuminated exit stair mid-right. Empty lower third stone floor for companion and enemy sprites. Atmospheric storybook gouache and watercolor, dusty indigo, petrol teal, antique bronze, muted gold accents; charming mysterious adventure, not horror, very readable silhouettes. No characters, no letters, no written numbers, no symbols or text on clock face, no UI, no watermark, no logos. Full image environment, tall vertical depth, clean focal hierarchy matching a mobile fantasy workshop game.

### endless-warden

原稿 `art-source/endless-warden.png`，发布 `public/art/endless-warden.webp`；1188×1324 RGBA，透明背景 True，真实 Alpha 范围 0–255，发布 416328 字节；转换保留透明度。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-aa0fea84-a1bd-46b6-b7fd-a386f6045c12.png`。PNG SHA-256 `c7ba36198cda8fbb75f65801d2957f15c7ff1680e2e77b51daca1d0e679c8bb5`。

最终提示词：

> Original hand-painted 2D fantasy mobile RPG boss sprite for Echo Workshop, full body isolated on transparent background. 'The Endless Warden': an ancient brass clockwork sentinel with a round blank clock-face chest and a glowing violet pendulum heart, asymmetrical armored shoulders built from worn bronze cogwheels, tiny teal glass eyes in a narrow knight visor, one hand clutching a coiled winding key and the other hand holding a long clock hand as a staff. Majestic stubborn mechanical guardian, melancholy and charming, not horror. Long dusty indigo fabric coat with brass rivets, bronze and muted amber glints, storybook gouache watercolor and fine ink edges, clear readable mobile silhouette. Three-quarter view facing slightly left toward player. Whole helmet, feet, staff included. No ground, backdrop, ground shadow, text, clock numbers, letters, logos, watermark, interface. Genuine alpha transparency around character and between limbs. Designed for a dark teal and amber clocktower background.


## 第四章原创美术 · 2026-10-03

内置 imagegen 生成并查看，原件保留。Pillow 仅做 WebP 格式转换（quality=85、method=6），没有做语义编辑或擦背景。最终合成在 390×844 浏览器截图查看；角色为静态精灵，动画、卷轴光标、封印光环和护盾由 Phaser 依据提交的状态绘制，不能决定模拟结果。

### corridor-background

原稿 `art-source/corridor-background.png`，发布 `public/art/corridor-background.webp`；1024×1536 RGB，透明背景 False，发布 299370 字节。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-a3308c47-96bf-45a5-ae1f-c8b752be7d55.png`。PNG SHA-256 `4126f1ef9fddf5f8835eb96339aadc6c9bb0e00fd345c1f6ff11c943d73db0d0`。

最终提示词：

> Create a premium hand-painted 2D fantasy mobile game environment, vertical 2:3 portrait, NO text, NO letters, NO UI, NO humans. A labyrinthine corridor in an ancient magical archive: deep teal stone arches, winding shelves of scrolls, floating parchment fragments and golden threads, a circular glass memory lens high in the center, a central closed ornate doorway in the far distance, violet fog flowing along the floor, warm amber lanterns, turquoise bioluminescent accents. Storybook gouache and watercolor texture, detailed silhouettes, soft painterly shading, theatrical fantasy adventure atmosphere, dark enough for bright gold UI overlay near top. Foreground bottom 25% is open stone floor so companion can be composited separately. Not photorealistic, no pixel art. Match a charming miniature stone golem adventure game palette with bronze gold, dark ink teal, aged parchment. Single complete scene full bleed.

### many-faced-archivist

原稿 `art-source/many-faced-archivist.png`，发布 `public/art/many-faced-archivist.webp`；1024×1536 RGBA，透明背景 True，实际 Alpha 0–254，发布 422166 字节；转换保留透明度。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-9671363b-117e-4be8-8c23-73d4373e6c43.png`。PNG SHA-256 `63a4f53d9d7a1813be0c036f80ad87c04773d4e8d6794ce423638c9f49457fdf`。

最终提示词：

> Single full-body character asset on transparent background, no text, no letters, no UI. 'The Many-Faced Archivist', a whimsical menacing 2D fantasy boss for a hand-painted mobile adventure. An animated tall stack of aged parchment scrolls and bronze archive rings, forming a floating magician silhouette with six overlapping ivory theatrical masks, each with different small glowing blue eyes. Main central mask looks thoughtfully sly, not horror. Coiled scroll ribbons create arms, holding a luminous turquoise crystal seal and a blank rolled scroll. Weathered dark teal fabric, bronze and amber details, violet magical wisps. Strong compact readable silhouette, hand-painted storybook gouache texture, soft dimensional illustration, charming mysterious personality. Full body centered, entire silhouette and all scroll ribbons fit with clear padding, facing slightly left, 2:3 character ratio. No floor, no environment, genuinely transparent cutout. Match warm parchment/dark teal stone fantasy archive scene.


## 第五章原创美术 · 2026-10-03

内置 imagegen 生成并查看；Pillow 仅以 quality=85、method=6 转 WebP，未语义修改。生成原件保留；文字与可执行状态由 React/Phaser 绘制。

### archive-background

原稿 `art-source/archive-background.png`，发布 `public/art/archive-background.webp`；1024×1536 RGB，发布 262750 字节。默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-699a6ebb-e4f9-4324-b0c8-8fe266af8fbb.png`。PNG SHA-256 `41aa3392ff15ffa4e9109341ec071f5c1af5b4d3796f770ac480bfade123fec3`。

最终提示词：

> Create a production background illustration for a portrait mobile fantasy adventure game Echo Workshop. Hand painted 2D gouache/storybook fantasy, dark blue teal shadows and warm amber light, beautiful weathered brass machinery and organic wood, restrained detailed painterly texture. Scene: a vast old archive interior, shelves of thick weathered books receding upwards, a circular brass memory cabinet and branching two stairways, a quiet amber worktable foreground, a glass memory lantern illuminating floating tiny blank parchment fragments. A low shallow flood channel at bottom, mysterious and inviting not horror. Environment only, no people or monsters. Portrait 2:3 aspect. Keep central lower-middle play area uncluttered, background is behind character sprites and game UI. No text, letters, logos, borders, watermark, UI. Crisp silhouette shapes readable on phone. Rich storybook craftsmanship, not 3D render, not pixel art.

### palimpsest-keeper

原稿 `art-source/palimpsest-keeper.png`，发布 `public/art/palimpsest-keeper.webp`；1024×1536 RGBA，实际 Alpha 0–254，发布 330116 字节，转换保留透明度。默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-f94aed6c-bfeb-4a2d-8003-e872084a7f85.png`。PNG SHA-256 `454ebda68e26257b6feaaecea3d21a7443e385e4fb0c1891c97050f4cbc7bbf5`。

最终提示词：

> Create one production sprite for a portrait mobile fantasy adventure game Echo Workshop. A fantastical boss named the Palimpsest Keeper: a dignified brass and aged parchment automaton archivist, tall and slender, a hood-like fan of layered parchment pages behind its head, glowing amber eyes, two arms holding a cracked glass memory lantern and a small archive key. Its robe made of overlapping worn book covers, a few floating blank pages surrounding upper body. Theme old remembered rules layering over new evidence; beautiful melancholy, not horror. Hand painted 2D gouache/storybook fantasy, dark teal shadows, aged brass and warm amber accents, readable crisp silhouette for small mobile sprite. Full body from head to feet, centred, slight three-quarter front view, feet near bottom, portrait 2:3. One isolated character, truly transparent background and alpha, no floor or scene, no shadows outside subject, no text, letters, numbers, logos, watermark, borders or UI. Not 3D, not pixel art.


## 第六章原创美术 · 2026-10-03

本轮通过内置 `image_gen__imagegen` 原创生成王庭场景和伪令摄政王，生成 PNG 已由制作方以 `view_image` 检查。原件保存在默认生成目录，并复制归档到 `art-source/`；发布图在 `public/art/`。Pillow 仅以 `quality=85, method=6` 压缩为 WebP，不缩放、裁切、擦背景或修改图像内容；颜色压缩为有损，不能宣称逐像素无损。摄政王 PNG 与 WebP 的 Alpha 通道逐像素一致，实际范围均为 0–254。

| 文件（相对 game） | 像素 | 模式 | 字节 | SHA-256 |
|---|---:|---|---:|---|
| art-source/court-background.png | 1024×1536 | RGB | 2981214 | `8118946413809d2b0d68c61ac4f60ba4026ea633a0c87d8be557dcc87ad78766` |
| public/art/court-background.webp | 1024×1536 | RGB | 317058 | `5e3148583c30c738b75a2b8aa81e4c41c78ef26540a8a3e466b267cdd51f6715` |
| art-source/counterfeit-regent.png | 1024×1536 | RGBA | 2825099 | `665662e8ab395d4514677151045c2707c8bee454fd7fccd78e395a5a507c6385` |
| public/art/counterfeit-regent.webp | 1024×1536 | RGBA | 397572 | `32f9e23ddcc3ff4839f50a8e829c06fc419fbdc839848aed919763dac5448867` |

`chapter-packs.json` 将两张 WebP 归入第六章，`Scene.tsx` 按章节预载。摄政王为静态透明精灵；场景的验收光环、身份与许可反馈及沙箱色调由程序绘制，现场或沙箱的已提交状态决定表现，图像和动画不能决定模拟胜负。这里记录资产来源与转换；浏览器与真机验收分别记入章节验收文档，不能由美术生成结果代替。

### court-background

生成模式：新生成，`transparent_background=false`。默认原件：`E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-10fb529d-adf5-4e31-8ead-4cbc17c9cfa5.png`。

完整提示词：

> Production illustration for Echo Workshop, a portrait mobile hand painted fantasy adventure. Environment background only. A grand mysterious council court in a decaying magical city, deep ink teal and indigo stone, aged brass and warm amber lanterns, a raised empty ivory throne far upper centre beneath three tall pointed arches, beautiful weathered blank hanging banners, closed ornate side doors and a small brass document verification stand at lower left, circular gold contract mosaic on the floor. Social authority and forged orders theme. Storybook gouache and watercolor, delicate ink edges, atmospheric 2D painterly illustration, readable shapes on phone, match whimsical stone golem adventure. Portrait 2:3. Lower quarter open floor and central play area clear for independently composited sprites. No characters, people or monsters, no text, numbers, logos, UI, watermark or borders, not photorealistic or pixel art.

### counterfeit-regent

生成模式：新生成，`transparent_background=true`。默认原件：`E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-7b28cc87-43a2-403d-b83f-984f7884ff51.png`。

完整提示词：

> Single original full-body boss character sprite for Echo Workshop mobile hand painted fantasy adventure, genuinely transparent alpha background. The Counterfeit Regent: theatrical dignified brass automaton in a sweeping dark teal indigo ceremonial robe with aged ivory blank scroll ribbons, a crooked three-point paper crown, a small pale porcelain mask with two glowing amber eyes, one hand showing a forged ornate seal, other holding a short ivory sceptre. A little unsettling but charming, not horror. Authority comes from props and posture, not real brand symbols. Storybook gouache watercolor with delicate ink edges, beautiful weathered brass details, strong clear silhouette on a phone. Three quarter front facing slightly left, whole crown, feet, ribbons and sceptre visible within frame with generous margins. Vertical portrait 2:3. One isolated character, no ground, environment or floor shadow, no text, numbers, letters, logos, labels, UI, watermark, borders. Transparent background required. Not 3D, not pixel art. Match deep teal and warm amber fantasy archive illustrations.

## 第七章原创美术 · 2026-10-03

内置 image_gen 原创生成桥区、同声桥匠、弥灯和砧舟。生成结果已实际查看；PNG 原稿复制至 art-source，Pillow 仅 quality=85/method=6 转为同尺寸 WebP。透明角色 Alpha 通道逐像素保留；颜色压缩有损。图像与动画不决定胜负，团队光环只表达已提交的任务/合并事件。浏览器与真机检查另行记录。

### bridge-background

原稿 `art-source/bridge-background.png`（3321556 字节），发布 `public/art/bridge-background.webp`（427154 字节）；1024×1536 RGB，Alpha 无。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-a5015d01-3557-4241-9e23-9c878ef4b08b.png`。PNG SHA-256 `7b41a08f2fea6d9c77ad97e51288d0935e9009947ea914a9210ee27e664d2241`；WebP SHA-256 `4d1d6ef4854ef0404fd1747097faad51bf4629cc8c119bf9c3bab409ebdda980`。新生成，transparent_background=false。

完整提示词：

> Production environment illustration for Echo Workshop, portrait mobile hand painted 2D fantasy adventure. A grand old magical bridge workshop suspended across a teal river gorge in the decaying but hopeful city. Two distinct workstations at left and right, delicate aged brass suspension cables, weathered stone arches, warm amber lamps, a blank translucent blueprint table in the far middle, tiny empty docks far below, distant layered rooftops and moss. The bridge in need of repair is partially visible behind the open central play area; lower quarter clear stone terrace for separately composited small golem characters. Beautiful storybook gouache watercolor and fine ink edges, rich dark indigo teal with warm brass accents, readable crisp shapes on phone. Environment only, no characters or monsters. Portrait 2:3. No text, letters, numbers, logos, interface, watermark, border. Not photorealistic, not 3D, not pixel art.

### chorus-bridgewright

原稿 `art-source/chorus-bridgewright.png`（2587010 字节），发布 `public/art/chorus-bridgewright.webp`（323718 字节）；1024×1536 RGBA，Alpha [0, 254]。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-8a8045c8-7da9-4f54-b742-7019fb6c01bc.png`。PNG SHA-256 `32430ce272454d19f1592faed42e83629506cd4cba9edac93e95cc9d992c54f8`；WebP SHA-256 `d91678b35cec3bbdff06ca7ba47e541137cf341d6f5b2926737a7d4413168f48`。新生成，transparent_background=true。

完整提示词：

> One isolated full body boss character sprite for Echo Workshop hand painted 2D fantasy mobile adventure. The Chorus Bridgewright: a dignified whimsical aged brass and carved wood automaton master builder with three overlapping porcelain mask faces, small separate amber glowing eyes, a layered robe of blank blueprint parchment, a fan of brass measuring compasses around head, two arms holding mismatched blank translucent bridge diagram sheets, several thin decorative articulated shoulder hands suggesting a chorus that all copies the same source. Intriguing and charming, not horror. Strong clear coherent silhouette for a small mobile sprite. Full head crown, tools and feet inside frame with generous margins. Three quarter facing slightly left. Storybook gouache watercolor with delicate ink edges, dark teal indigo aged brass warm amber accents. Portrait 2:3. Genuinely transparent alpha background, no ground or shadows outside character, no environment, no text, letters, numbers, logos, UI, watermark, border. Not 3D or pixel art.

### mideng-companion

原稿 `art-source/mideng-companion.png`（1629321 字节），发布 `public/art/mideng-companion.webp`（318434 字节）；1254×1254 RGBA，Alpha [0, 255]。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-0ade1efb-b7bc-4b12-8896-6dc17356e9b6.png`。PNG SHA-256 `b36b3147e6ef85faad7063bbbb36801211e7854541d9bf6493a31594abc92880`；WebP SHA-256 `d2b431f9c93195c7fc7d7adf83925cc156ff99cdbf2cbdc1178066d003d9ebf3`。新生成，transparent_background=true。

完整提示词：

> One original friendly recruitable companion sprite for Echo Workshop mobile 2D hand painted fantasy game. Mideng, a small brass and moss stone surveying golem, rounded compact body and expressive two amber eyes, soft teal explorer cape, holding a beautifully designed lantern which divides into two small warm measuring lights, a brass compass strapped to side. Thoughtful curious surveyor, unmistakably distinct from a bulky mechanic. Full body, clear charming silhouette readable at 90 pixels, three quarter front facing slightly right, generous transparent margin around head lantern and feet. Storybook gouache watercolor, fine ink edges, aged brass and dark teal with warm amber light, consistent painterly fairy tale craft. Square composition. Truly transparent alpha background, no scenery, ground or external shadow, no text, letters, numbers, logos, UI, watermark or border. Not 3D, not pixel art.

### zhenzhou-companion

原稿 `art-source/zhenzhou-companion.png`（1724403 字节），发布 `public/art/zhenzhou-companion.webp`（290434 字节）；1254×1254 RGBA，Alpha [0, 255]。

默认原件 `E:/CodexState/home/generated_images/01a09442-5f82-71c1-bdd3-70f8d293450b/exec-0b67d49e-e886-4191-bfa5-ad06bbd07539.png`。PNG SHA-256 `b5f566f8b49970d06000f5733ce31a375928e9e39e3e537054092727ea13fcf7`；WebP SHA-256 `09d07ab0829fec03245540c30f60366fde1db300d27df3c5509f499f7f870068`。新生成，transparent_background=true。

完整提示词：

> One original friendly recruitable companion sprite for Echo Workshop mobile 2D hand painted fantasy game. Zhenzhou, a compact sturdy wooden and brass artisan golem, warm expressive amber eyes under a small practical ivory workshop cap, deep indigo work apron, brass jointed arms, a folding wooden ruler resting over shoulder and a short construction mallet in one hand. Patient capable builder, charming small broad body, clearly distinct from a slender surveying lantern golem. Full body with all tools and feet visible, clear silhouette readable at 90 pixels, three quarter front facing slightly left, generous transparent margins. Storybook gouache watercolor, fine ink edges, weathered brass wood and deep teal indigo with warm amber accents. Square composition. Truly transparent alpha background, no scenery, ground or external shadow, no text, letters, numbers, logos, UI, watermark or border. Not 3D, not pixel art.

## 镜面议会 v0.9 · 第八章资源（制作中）

使用会话内置图像生成工具独立生成两张原创素材；原图保留，发布用WebP只压缩格式，不编辑背景或透明边界。文字由界面绘制，不烘焙在图像。

### council-background

原图：`E:\CodexState\home\generated_images\01a09442-5f82-71c1-bdd3-70f8d293450b\exec-798d1ff9-498d-4e8b-997e-0a91eb80ada6.png`。项目原稿 `art-source/council-background.png`，发布图 `public/art/council-background.webp`。尺寸 1024×1536，RGB，alpha None。PNG 2996088字节 / SHA-256 `f6d7ff291a0176da5733c6d05ef32afb567adb856bd9c50ed1bf402ae1b02b6c`；WebP 356442字节 / SHA-256 `292fafaaa8e0ce2685603d4c0c8f6bc7e4d215e392768ba5cef86c30bd34acaf`，quality85/method6；alpha逐像素保留。

最终提示词：

```text
Portrait mobile fantasy strategy adventure game background, 1024x1536 visual composition. A richly hand-painted 2D storybook scene for The Echo Workshop, consistent warm brass wood teal muted indigo parchment palette, soft atmospheric painterly textures, exquisite but readable silhouettes. The Mirror Council chamber in a magical industrial city: large ancient round mirror windows above a vaulted arch, small brass gauges with green glowing crystals arranged on a raised dais in upper half, below them two distinct side alcoves with unlit miniature neighborhoods visible through round portals. Warm golden late afternoon beams and cool violet reflected light. Middle center at y40-65 percent a large open circular marble evaluation table with subtle empty brass rings and crystal measuring devices, no text or numbers. Lower 28 percent wide open wood and stone foreground terrace for three small characters and HUD, no large objects blocking them. Strong depth, hand-drawn slight rough ink edges. No typography, no interface buttons, no letters, no logos, no modern screen or computer, no characters, no border. Designed game art, not a photograph, carefully staged mobile vertical scene with focal point at upper third.
```

### mirror-speaker

原图：`E:\CodexState\home\generated_images\01a09442-5f82-71c1-bdd3-70f8d293450b\exec-723c5a8d-fa5d-4785-adfc-a85bc5cf8fa1.png`。项目原稿 `art-source/mirror-speaker.png`，发布图 `public/art/mirror-speaker.webp`。尺寸 1024×1536，RGBA，alpha (0, 254)。PNG 2610593字节 / SHA-256 `46e048b2a8c0af5bef9a8a476fac4b01025d74df900fca2f1c5b48b6506e6dfa`；WebP 326112字节 / SHA-256 `484603799ac8e1a40b2d9f146da8c981887c29fe171c700935268265dbf1f170`，quality85/method6；alpha逐像素保留。

最终提示词：

```text
Transparent background, single full-body enemy boss character sprite for a portrait mobile hand-painted 2D fantasy strategy adventure game called The Echo Workshop. Mirror Speaker, an elegant and imposing magical brass automaton who chairs a city council: broad ornamental cloak of deep indigo and muted teal, a large oval antique mirror as its head with a calm abstract reflected golden face made of geometric light, ornate brass clockwork shoulders, two delicate mechanical hands one holding a small circular crystal gauge glowing green and one holding a fragmented mirror reflecting a dark small neighborhood. Intimidating dignified whimsical storybook villain, not horror. Gold filigree and hand-painted textured brushwork, soft warm highlights, slight ink outline, visually clear silhouette. Three-quarter pose facing left, full head, full cloak, both hands and both boots visible with spacious transparent margins, centered upright composition. Aspect ratio2:3, high quality game illustration. No scenery, no ground plane, no text, no letters or digits, no UI, no frame, no logos. True transparent alpha outside character and objects.
```
