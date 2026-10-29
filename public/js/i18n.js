// English or Japanese, and how dates are written.
//
//   t("Hide sidebar")                 the words in the chosen language
//   t("{n} images", { n: 3 })         with {placeholders} filled in
//   fmtDate("2026-10-22", "long")     a date, in the chosen date style
//
// To translate something new: wrap the English in t(...) where it's shown, and add the
// Japanese to JA below. Anything missing from JA simply stays in English.
// Your own section and field names from .pages.yml are looked up here too, so the common
// ones on studiotomby.com ("featured image", "carousel"...) show in Japanese.

const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export const lang = () => read("wip-lang", "en");
export function setLang(l) { write("wip-lang", l); document.documentElement.lang = l; }
document.documentElement.lang = lang();

// western: October 22, 2026 · japanese: 2026年10月22日
export const dateStyle = () => { const d = read("wip-dates", lang() === "ja" ? "japanese" : "western"); return d === "era" ? "japanese" : d; };
export const setDateStyle = (s) => write("wip-dates", s);

export function t(text, vars) {
  let out = (lang() === "ja" && JA[text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}
// Sentence case for names of fields, sections and settings: the first word capitalized, the
// rest as written ("blog posts" -> "Blog posts", "open another site…" -> "Open another site…").
// Abbreviations are kept in capitals ("html" -> "HTML"). Only in English; Japanese has no case.
const ACRONYMS = new Set(["html", "css", "url", "pdf", "rss", "seo", "id"]);
export function sentenceCase(text) {
  if (lang() === "ja") return text;
  let first = true;
  return String(text).split(/(\s+|(?=[(])|(?<=[(]))/).map((w) => {
    if (!/\w/.test(w)) return w;
    if (ACRONYMS.has(w.toLowerCase())) { first = false; return w.toUpperCase(); }
    if (!first) return w;
    first = false;
    if (/[/.@]/.test(w) || /^\d/.test(w) || /[A-Z]/.test(w.slice(1))) return w;   // "/projects/…", "16px", "iPhone": as they are
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join("");
}
// a name, translated and in sentence case
export const tl = (text, vars) => sentenceCase(t(text, vars));

// one / many: t2(n, "{n} image", "{n} images")
export const t2 = (n, one, many, vars = {}) => t(n === 1 ? one : many, { n, ...vars });

// kind: weekday (Wed 22 / 22日 (水)) · long (October 22, 2026) · short (Oct 22, 2026) · day (Oct 22) · month (October 2026)
//       monthName (October) · year (2026)
// the day of a date in pieces, for lining dates up in a list:
// { style, weekday: "Thu" / "木", day: "22", month: "10", monthName: "Oct" }
export function dayParts(value, style = dateStyle()) {
  const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + "T12:00:00");
  if (isNaN(d)) return null;
  return { style, day: String(d.getDate()), month: String(d.getMonth() + 1), monthName: d.toLocaleDateString("en-US", { month: "short" }),
    weekday: style === "western" ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("ja-JP", { weekday: "short" }) };
}

export function fmtDate(value, kind = "long", style = dateStyle()) {
  const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + "T12:00:00");
  if (isNaN(d)) return "";
  // the day within its month, for lists already grouped by month: "Wed 22" / "22日 (水)"
  if (kind === "weekday") {
    if (style === "western") return d.toLocaleDateString("en-US", { weekday: "short" }) + " " + d.getDate();
    return `${d.getDate()}日 (${d.toLocaleDateString("ja-JP", { weekday: "short" })})`;
  }
  if (style === "western") {
    const o = { long: { year: "numeric", month: "long", day: "numeric" }, short: { year: "numeric", month: "short", day: "numeric" },
      day: { month: "short", day: "numeric" }, month: { year: "numeric", month: "long" }, monthName: { month: "long" }, year: { year: "numeric" } }[kind];
    return d.toLocaleDateString("en-US", o);
  }
  const era = style === "era";
  const loc = era ? "ja-JP-u-ca-japanese" : "ja-JP";
  const y = era ? { era: "long", year: "numeric" } : { year: "numeric" };
  const o = { long: { ...y, month: "long", day: "numeric" }, short: { ...y, month: "long", day: "numeric" }, day: { month: "long", day: "numeric" },
    month: { ...y, month: "long" }, monthName: { month: "long" }, year: y }[kind];
  return d.toLocaleDateString(loc, o);
}

const JA = {
  // ----- window, sidebar, list -----
  "Open another site": "別のサイトを開く", "Open another site…": "別のサイトを開く…",
  "Hide sidebar": "サイドバーを隠す", "Show sidebar": "サイドバーを表示",
  "Library": "ライブラリ", "Collections": "コレクション", "Images": "画像", "Settings": "設定", "Pages": "ページ", "Sections": "セクション",
  "{n} change to publish": "公開待ちの変更 {n} 件", "{n} changes to publish": "公開待ちの変更 {n} 件",
  "Everything is published": "すべて公開済み",
  "No date": "日付なし", "Search": "検索", "Search {label}": "{label}を検索",
  "{n} item": "{n} 件", "{n} items": "{n} 件", ", {n} draft": "、下書き {n} 件", ", {n} drafts": "、下書き {n} 件",
  "New in {label}": "{label}に新規作成", "Add new item": "新しい項目を追加", "Show as": "表示方法", "List": "リスト", "Grid": "グリッド", "Titles only": "タイトルのみ",
  "Nothing matches.": "一致するものはありません。", "Nothing here yet.": "まだ何もありません。", "Resize list": "リストの幅を変更",
  "Expand all": "すべて開く", "Collapse all": "すべて閉じる",
  "Draft": "下書き", "Published": "公開中",
  "Title": "タイトル", "Permalink": "パーマリンク", "made from the title": "タイトルから作成",
  "New {kind}": "新規作成：{kind}",
  "The permalink follows the title unless you change it. New posts start as drafts.": "パーマリンクは、変更しない限りタイトルに合わせて作られます。新しい投稿は下書きから始まります。",
  "Cancel": "キャンセル", "Create": "作成", "Back": "戻る", "New": "新規", "Open": "開く", "Open (drag to move)": "開く（ドラッグで移動）", "Done": "完了", "Details": "詳細",
  // ----- toolbar and menus -----
  "Insert a block": "ブロックを挿入", "Add photos": "写真を追加", "Done rearranging": "並べ替えを終了", "Rearrange blocks": "ブロックを並べ替え",
  "Open on your site": "サイトで開く", "Open on your site (new tab)": "サイトで開く（新しいタブ）",
  "Hide details": "詳細を隠す", "Show details": "詳細を表示", "More": "その他",
  "Revert to when opened": "開いた時の状態に戻す", "Move to Trash": "ゴミ箱に移動",
  "Appearance": "外観", "Match my computer": "コンピュータに合わせる", "System": "システム", "Light": "ライト", "Dark": "ダーク",
  "Themes, colors and fonts…": "テーマ・色・フォント…", "Language": "言語", "Dates": "日付の書き方",
  "View": "表示", "Write": "書く", "Split": "分割", "Preview": "プレビュー",
  "Live preview": "ライブプレビュー", "Preview size": "プレビューのサイズ", "Computer": "パソコン", "Phone": "スマホ",
  "Reload preview": "プレビューを再読み込み", "Live: shows changes as you type": "ライブ：入力するとすぐに反映されます",
  "Starting the preview…": "プレビューを起動中…", "Updating…": "更新中…",
  "Choose one of your {label}, or start a new one.": "{label}から選ぶか、新しく作成してください。",
  "Choose something from the sidebar.": "サイドバーから選んでください。",
  "There's no folder at {path}.": "{path} にフォルダがありません。",
  "Open a site": "サイトを開く", "Recent": "最近使ったサイト",
  "The site's main folder. In Finder, select the folder and press ⌥⌘C to copy its path, then paste it here. A folder that isn't set up for w·i·p cms yet (a new client site, say) gets a few questions first.":
    "サイトのメインフォルダです。Finderでフォルダを選んで ⌥⌘C を押すとパスがコピーされるので、ここに貼り付けてください。まだ w·i·p cms 用に設定されていないフォルダ（新しいクライアントのサイトなど）は、いくつか質問に答えてから開きます。",
  "Couldn't read that site's settings (.pages.yml), so pick a site to open.": "サイトの設定（.pages.yml）を読み込めませんでした。開くサイトを選んでください。",
  // ----- editing -----
  "Saved": "保存済み", "Saving…": "保存中…", "Not saved": "保存されていません", "Edited": "編集済み",
  "Date": "日付", "Change the date": "日付を変更", "Add a date": "日付を追加",
  "A draft: not on the site. Click to publish it when you next push.": "下書き：サイトには表示されません。クリックすると、次にプッシュした時に公開されます。",
  "On the site. Click to make it a draft.": "サイトに公開中です。クリックすると下書きに戻ります。",
  "add tag": "タグを追加", "Add a tag": "タグを追加", "Remove tag {tag}": "タグ「{tag}」を削除",
  "{n} image": "{n} 枚", "{n} images": "{n} 枚", "{label} (optional)": "{label}（任意）",
  "This page's fields are all in the document.": "このページの項目はすべて本文側にあります。", "Address": "アドレス",
  "Put this back the way it was when you opened it? Your changes since then will be lost.": "開いた時の状態に戻しますか？それ以降の変更は失われます。",
  "Revert": "元に戻す",
  "Move “{title}” to the Trash? It goes into the .cms-trash folder in your site, so you can get it back.": "「{title}」をゴミ箱に移動しますか？サイト内の .cms-trash フォルダに移されるので、後で戻せます。",
  "Moved to .cms-trash": ".cms-trash に移動しました",
  "Insert": "挿入", "Delete this {type} block?": "この{type}ブロックを削除しますか？", "Delete": "削除",
  "{n} photo": "写真 {n} 枚", "{n} photos": "写真 {n} 枚", "empty": "空",
  "Drag to move": "ドラッグして移動", "Delete block": "ブロックを削除", "Move up": "上へ", "Move down": "下へ",
  "Unknown block type “{type}”": "不明なブロックの種類「{type}」",
  "carousel · one at a time, changes every {s} seconds": "カルーセル · 1枚ずつ、{s}秒ごとに切り替わります",
  "collage · all at once, staggered": "コラージュ · すべてを互い違いに並べます",
  "Insert a block here": "ここにブロックを挿入", "Add {label}": "{label}を追加", "Write something…": "ここに書く…",
  "Remove": "削除", "Add": "追加", "add…": "追加…", "Item {n}": "項目 {n}",
  "Bold (⌘B)": "太字（⌘B）", "Italic (⌘I)": "斜体（⌘I）", "Link": "リンク", "link": "リンク", "link text": "リンクテキスト",
  "Line break: a new line in the same paragraph (⇧↩)": "改行：同じ段落のまま次の行へ（⇧↩）", "line break": "改行", "Source": "ソース",
  "Link to (web address):": "リンク先（ウェブアドレス）：",
  // ----- images -----
  "Remove image": "画像を削除", "Upload from": "アップロード元", "Choose from": "選ぶ：", "or upload from": "またはアップロード：", "Only pictures can go here.": "ここには画像だけを追加できます。",
  "Added {n} file": "{n} 件追加しました", "Added {n} files": "{n} 件追加しました", "Drop to add to this post": "ドロップしてこの投稿に追加",
  "Pictures become image blocks, videos become video blocks, other files become links.": "画像は画像ブロック、動画は動画ブロック、その他のファイルはリンクになります。",
  "This page has no blocks: drop pictures onto an image field instead.": "このページにはブロックがありません。画像は画像の項目にドロップしてください。", "Upload from this computer": "このパソコンからアップロード", "Choose": "選ぶ", "Upload": "アップロード", "Upload from your phone": "スマホからアップロード",
  "Move earlier": "前へ", "Move later": "後へ", "From phone": "スマホから", "Refresh": "更新", "Close": "閉じる",
  "Uploaded {n} image": "{n} 枚アップロードしました", "Uploaded {n} images": "{n} 枚アップロードしました", "Copied {url}": "コピーしました：{url}",
  "No images here yet. Upload some, or go up a folder.": "まだ画像がありません。アップロードするか、上のフォルダに戻ってください。",
  "No network found.": "ネットワークが見つかりません。",
  "Scan with your phone's camera (same Wi‑Fi as this Mac), choose photos, and they'll appear here.": "スマホのカメラでスキャンして（このMacと同じWi‑Fiで）写真を選ぶと、ここに表示されます。",
  "Saving into: {folder}": "保存先：{folder}", "Or open: ": "またはこちらを開く：",
  "If your phone can't connect, macOS may be asking to allow incoming connections for “node”: click Allow.": "スマホから接続できない場合は、macOS が「node」への接続を許可するか尋ねているかもしれません。「許可」をクリックしてください。",
  "{n} photo from your phone": "スマホから {n} 枚", "{n} photos from your phone": "スマホから {n} 枚",
  "Drop images here to upload into this folder. Click one to copy its address.": "ここに画像をドロップすると、このフォルダにアップロードされます。画像をクリックするとアドレスをコピーします。",
  "Use selected": "選択した画像を使う", "{n} selected": "{n} 枚選択中", "Pick one or more images": "画像を1枚以上選んでください", "Pick an image": "画像を選んでください",
  "Tip: drop images onto this window to upload": "ヒント：このウィンドウに画像をドロップするとアップロードできます",
  "images": "画像", "(new folder: made when you upload)": "（新しいフォルダ：アップロード時に作られます）",
  // ----- setting up a site -----
  "Set up “{name}”": "「{name}」を設定", "Pages folder (the site generator's input)": "ページのフォルダ（サイトジェネレーターの入力）",
  "Images folder, inside it": "その中の画像フォルダ", "Folders already there: {list}": "既にあるフォルダ：{list}", "Sections": "セクション",
  "Name in the sidebar": "サイドバーでの名前", "Folder": "フォルダ", "Kind": "種類", "Writing": "本文", "Template": "テンプレート", "optional": "任意",
  "Posts": "投稿", "Text": "テキスト", "Blocks": "ブロック", "Add a section": "セクションを追加", "Remove {label}": "「{label}」を削除", "Set up": "設定する",
  "Title, featured image, date, draft, tags": "タイトル、アイキャッチ画像、日付、下書き、タグ", "Title and a short description": "タイトルと短い説明",
  "One piece of writing under the title (Markdown)": "タイトルの下に1つの文章（Markdown）",
  "Text, images, carousels, collages… (the site's templates must show blocks)": "テキスト、画像、カルーセル、コラージュ…（サイトのテンプレートがブロックに対応している必要があります）",
  "This looks like a {generator} site. ": "{generator} のサイトのようです。", "This looks like an {generator} site. ": "{generator} のサイトのようです。",
  "w·i·p cms will write a .pages.yml file describing the sections below, and make their folders. Each post or page becomes its own folder with an index.md inside. You can change all of this later in .pages.yml.":
    "w·i·p cms が下のセクションを記した .pages.yml を作り、それぞれのフォルダを作成します。投稿やページは1つずつ、中に index.md が入ったフォルダになります。すべて後から .pages.yml で変更できます。",
  "Posts get a title, featured image, date, draft switch and tags; pages get a title and a description. “Blocks” lets you mix text, images, carousels and collages, like your own site, but the client site's templates need to be able to show them. “Template” fills in the layout field (for Eleventy, e.g. post.njk).":
    "投稿にはタイトル、アイキャッチ画像、日付、下書きスイッチ、タグが、ページにはタイトルと説明が付きます。「ブロック」ではあなたのサイトのようにテキスト・画像・カルーセル・コラージュを組み合わせられますが、クライアントのサイトのテンプレートが対応している必要があります。「テンプレート」は layout 項目に入ります（Eleventy なら post.njk など）。",
  // ----- appearance -----
  "Quit w·i·p cms": "w·i·p cms を終了", "w·i·p cms has stopped": "w·i·p cms を終了しました",
  "Everything is saved. You can close this window; open w·i·p cms again when you need it.": "すべて保存されています。このウィンドウは閉じて大丈夫です。必要な時にまた w·i·p cms を開いてください。",
  "Export": "書き出す", "Import…": "読み込む…", "That file isn't a w·i·p cms theme.": "このファイルは w·i·p cms のテーマではありません。",
  "Group and sort": "グループと並べ替え", "Group by": "グループ", "Sort by": "並べ替え", "Month": "月", "Year": "年", "Nothing": "なし", "None": "なし",
  "Newest first": "新しい順", "Oldest first": "古い順",
  "Order on the site": "サイトでの順番", "Add pictures:": "画像を追加：", "Add an empty one": "空の項目を追加", "Open all": "すべて開く", "Fold all": "すべて閉じる",
  "Link": "リンク", "Web address": "URL", "A web address, e.g. a video on Google Drive": "URL（Google ドライブの動画など）", "or": "または",
"It goes at the top of the list; drag it to where it belongs.": "一覧のいちばん上に追加されます。ドラッグして好きな位置へ移動できます。",
  "The permalink follows the title unless you change it.": "パーマリンクは、変更しない限りタイトルから作られます。",
  "This list was changed somewhere else (another window, or outside w·i·p cms). Reopen the item to see the latest, then make your change again.": "この一覧は別の場所（別のウインドウや w·i·p cms の外）で変更されました。項目を開き直してから、もう一度変更してください。",
  "Add a collection or page": "コレクションやページを追加", "Add to the sidebar": "サイドバーに追加", "Collection": "コレクション", "Page": "ページ",
  "Many entries you keep adding to, like blog posts or projects": "ブログやプロジェクトのように、項目を増やしていくもの", "One page you edit, like About": "「About」のような1つのページ",
  "Many entries you keep adding to, like blog posts or projects.": "ブログやプロジェクトのように、項目を増やしていくもの。", "One page you edit, like About.": "「About」のような1つのページ。",
  "Name": "名前", "Fields": "項目", "Same as {label}": "{label}と同じ", "Posts: title, picture, date, draft, tags": "投稿：タイトル・画像・日付・下書き・タグ", "Simple: title and text": "シンプル：タイトルと本文",
  "Kept as": "保存のしかた", "Markdown files in a folder": "フォルダ内の Markdown ファイル", "A list in one data file": "1つのデータファイル内のリスト", "A Markdown page": "Markdown のページ", "A data file": "データファイル",
  "Writing": "書き方", "In the sidebar under": "サイドバーの場所", "Saved in": "保存先", "e.g. Exhibitions": "例：Exhibitions", "e.g. Contact": "例：Contact",
  "w·i·p cms adds it to .pages.yml and makes a place for its content, ready to write in. The site shows it once the site's own templates do; that part is different on every site, and w·i·p cms says what's needed after adding.": "w·i·p cms が .pages.yml に追加し、内容の置き場所を作るので、すぐに書き始められます。サイトに表示されるのは、サイト側のテンプレートが対応してからです（サイトごとに違うので、追加後に必要なことをお知らせします）。",
  "Collection added": "コレクションを追加しました", "Page added": "ページを追加しました", "It's in .pages.yml and ready to write in.": ".pages.yml に追加しました。すぐに書き始められます。", "general": "一般",
  "The title on its own page. Leave it empty to use the short title.": "その投稿のページに出るタイトル。空にすると短いタイトルが使われます。",
  "The full title is the heading of its page; the short title is for lists, and the permalink follows it (or the full title) unless you change it.": "正式タイトルはページの見出しに、短いタイトルは一覧に使われます。パーマリンクは、変更しない限り短いタイトル（なければ正式タイトル）から作られます。",
  "Media": "メディア", "Select": "選択", "Select all": "すべて選択", "Select none": "選択を解除", "Click files to select them": "ファイルをクリックして選択", "{n} selected": "{n} 件を選択",
  "{n} of these are still used on the site, in {places}. Moving them to the Trash breaks those until you put them back.": "このうち {n} 件はサイトでまだ使われています（{places}）。ゴミ箱に移すと、戻すまで表示されなくなります。", " and {n} more": " ほか {n} 件",
  "Move {n} file to the Trash?": "{n} 件のファイルをゴミ箱に移しますか？", "Move {n} files to the Trash?": "{n} 件のファイルをゴミ箱に移しますか？", "They go into the .cms-trash folder in your site, so you can get them back.": "サイト内の .cms-trash フォルダに移るので、元に戻せます。",
  "Moved {n} file to .cms-trash": "{n} 件を .cms-trash に移しました", "Moved {n} files to .cms-trash": "{n} 件を .cms-trash に移しました", "Select several (or ⌘-click)": "複数を選択（⌘クリックでも）",
  "Nothing here yet. Upload some, or go up a folder.": "まだ何もありません。アップロードするか、上のフォルダに戻ってください。",
  "Drop files here to upload into this folder. Click one to copy its address; ⌘-click or Select to pick several.": "ここにファイルをドロップすると、このフォルダにアップロードされます。クリックでアドレスをコピー、⌘クリックか「選択」で複数を選べます。",
  "Nickname": "ニックネーム", "Give it a nickname": "ニックネームをつける", "Your own name for this site, shown in the sidebar and the list of recent sites instead of its folder's name. Only on this Mac; the site itself doesn't change.": "このサイトに自分でつける名前。サイドバーと最近のサイトの一覧で、フォルダ名のかわりに表示されます。この Mac だけの設定で、サイト自体は変わりません。",
  "Finishing an update…": "アップデートを仕上げています…", "w·i·p cms was updated. It's restarting to use the new version; this takes a few seconds.": "w·i·p cms がアップデートされました。新しいバージョンで起動し直しています（数秒かかります）。",
  "Date format": "日付の書き方",
  "Icons": "アイコン", "List": "リスト", "Columns": "カラム", "Name": "名前", "Kind": "種類", "Size": "サイズ", "Date modified": "変更日", "Folder": "フォルダ", "Image": "画像", "Video": "動画",
  "Modified {date}": "変更日：{date}", "Copy address": "アドレスをコピー", "View": "表示",
  "Writing": "書く", "Use typographer's quotes": "引用符を自動で組版用にする", "Save after": "自動保存まで", "seconds without typing": "秒（入力が止まってから）",
  "Typographer's quotes: \" and ' become “ ” and ‘ ’ as you type (apostrophes too), as in InDesign. Not in Source, HTML or web addresses. ⌘S always saves straight away.": "組版用の引用符：入力した \" と ' が “ ” と ‘ ’ になります（アポストロフィも）。InDesign と同じです。ソース、HTML、URL では変わりません。⌘S でいつでもすぐ保存できます。",
  "Starting up": "起動", "When w·i·p cms opens": "w·i·p cms を開いたとき", "Open the last site": "前回のサイトを開く", "Show the list of sites": "サイトの一覧を表示",
  "For dark backgrounds": "暗い背景用", "For light backgrounds": "明るい背景用",
  "Draft: not on the site yet": "下書き：まだサイトに出ていません",
  "Switching language reloads w·i·p cms. Interface size makes the sidebar, list, toolbar and inspector bigger or smaller; the writing has its own size, in Customize → Typography. ⌘S always saves straight away.": "言語を切り替えると w·i·p cms が再読み込みされます。「表示の大きさ」はサイドバー・一覧・ツールバー・詳細の大きさを変えます（本文の大きさは「カスタマイズ → 文字」で）。⌘S でいつでもすぐ保存できます。",
  "\" and ' become “ ” and ‘ ’ as you type (apostrophes too), as in InDesign. Not in Source, HTML or web addresses.": "入力した \" と ' が “ ” と ‘ ’ になります（アポストロフィも）。InDesign と同じです。ソース、HTML、URL では変わりません。",
  "The preview isn't running.": "プレビューが動いていません。", "Starting the preview… The first time can take a little while.": "プレビューを起動しています…（初回は少し時間がかかります）",
  "The preview isn't running. Quit w·i·p cms from the ⋯ menu and open it again to restart it.": "プレビューが動いていません。⋯ メニューから w·i·p cms を終了し、もう一度開くと再起動します。",
  "Settings": "設定", "Settings…": "設定…", "Interface size": "表示の大きさ", "Reset": "元に戻す", "Site": "サイト",
  "w·i·p cms reloads to switch language. Your section and field names switch too, for the common ones.": "言語を切り替えると w·i·p cms が再読み込みされます。よく使うセクション名やフィールド名も切り替わります。",
  "Switching language reloads w·i·p cms. Interface size makes the sidebar, list, toolbar and inspector bigger or smaller; the writing has its own size, in Customize → Typography.": "言語を切り替えると w·i·p cms が再読み込みされます。「表示の大きさ」はサイドバー・一覧・ツールバー・詳細の大きさを変えます。本文の大きさは「カスタマイズ → 文字」で変えられます。", "General": "一般",
  "Customize": "カスタマイズ", "Customize…": "カスタマイズ…", "Themes": "テーマ", "Typography": "文字", "Editing “{name}”": "「{name}」を編集中",
  "Built-in themes can't be changed. Duplicate one to make it your own.": "内蔵のテーマは変更できません。複製すると自分用に変えられます。",
  "Duplicate “{name}”": "「{name}」を複製", "copy": "のコピー", "Surfaces": "背景", "Text and accent": "文字とアクセント", "Interface": "画面",
  "Font": "フォント", "Weight": "太さ", "Size": "大きさ", "Line spacing": "行間", "Letter spacing": "字間", "Word spacing": "語間", "Code": "コード",
  "From Google Fonts": "Google Fonts から読み込む", "Bold": "太字",
  "Mode": "モード", "Light theme": "ライトテーマ", "Dark theme": "ダークテーマ", "Duplicate": "複製", "Duplicate “{name}” to customize": "「{name}」を複製してカスタマイズ",
  "Delete theme": "テーマを削除", "Built-in themes can't be changed. Duplicate one to make your own: colors, fonts and code colors.": "内蔵のテーマは変更できません。複製すると、色・フォント・コードの色を自由に変えられます。",
  "Name": "名前", "Untitled": "名称未設定", "Used for": "使うモード", "Light mode": "ライトモード", "Dark mode": "ダークモード", "Light or dark": "ライトかダーク",
  "Colors": "色", "Writing background": "本文の背景", "Sidebar": "サイドバー", "Post list": "投稿リスト", "Toolbar & inspector": "ツールバーとインスペクタ",
  "Cards & menus": "カードとメニュー", "Secondary text": "補助テキスト", "Accent": "アクセント",
  "Code colors (Source view and HTML)": "コードの色（ソース表示とHTML）", "Writing size: {n}px": "文字の大きさ：{n}px", "Line spacing: {n}": "行間：{n}", "Letter spacing: {n}em": "字間：{n}em",
  "Writing weight": "文字の太さ", "Regular": "標準", "Medium": "中太", "Semibold": "やや太",
  "Interface font": "画面のフォント", "Writing font (titles and text)": "本文のフォント（タイトルと文章）", "Code font (Source view)": "コードのフォント（ソース表示）",
  "Other font…": "その他のフォント…", "Font name, e.g. Inter": "フォント名（例：Inter）",
  "Load it from Google Fonts (otherwise it must be installed on this Mac)": "Google Fonts から読み込む（オフの場合はこのMacにインストールされている必要があります）",
  "Paper": "ペーパー", "Ink": "インク", "Ayu": "Ayu",
  // ----- names from .pages.yml (studiotomby.com) -----
  "blog posts": "ブログ", "projects": "プロジェクト", "pages": "ページ", "settings": "設定", "site settings": "サイト設定", "nonbreaking": "改行しない語句",
  "home": "ホーム", "about": "プロフィール", "title": "タイトル", "short title": "短いタイトル", "full title": "正式なタイトル",
  "featured image": "アイキャッチ画像", "draft": "下書き", "tags": "タグ", "date": "日付", "category": "カテゴリー", "ongoing": "進行中", "book": "書籍",
  "gallery (shown in the grid beside the text)": "ギャラリー（本文の横のグリッドに表示）", "related blog posts": "関連するブログ記事",
  "text": "テキスト", "image": "画像", "multi-upload": "まとめてアップロード", "carousel": "カルーセル", "collage": "コラージュ", "html": "HTML",
  "caption": "キャプション", "caption (optional)": "キャプション（任意）", "aside next": "隣に並べる", "caption position": "キャプションの位置",
  "below": "下", "side": "横", "alt text": "代替テキスト", "alt text (optional)": "代替テキスト（任意）", "seconds per image": "1枚あたりの秒数",
  "Images ": "画像", "project text": "プロジェクトの文章", "post": "本文", "blocks": "ブロック", "pick tags…": "タグを選ぶ…",
  // ----- the spreadsheet, help and guardrails -----
  "Advanced": "詳細", "Advanced tools": "詳細ツール", "Spreadsheet": "スプレッドシート",
  "Adds a spreadsheet view to lists: every entry as a row, edited right in the cells, and rows pasted in from Google Sheets, Numbers or Excel. Handy for lots of entries at once; the writing and pictures still open in the editor.":
    "リストにスプレッドシート表示を加えます。各項目が1行になり、セルの中で直接編集でき、Google スプレッドシート・Numbers・Excel から行を貼り付けられます。たくさんの項目をまとめて扱うときに便利です。文章や画像はこれまでどおりエディタで開きます。",
  "Copy all": "すべてコピー", "The whole table, to paste into a spreadsheet": "表全体をコピー（スプレッドシートに貼り付けられます）",
  "Open": "開く", "Open to edit": "開いて編集", "New": "新規",
  "{n} row": "{n} 行", "{n} rows": "{n} 行",
  "Paste rows copied from a spreadsheet into any cell; rows past the last one are added.": "スプレッドシートからコピーした行をどのセルにも貼り付けられます。最後の行より下の分は新しい行として追加されます。",
  "“{v}” can't go in {label}.": "「{v}」は{label}に入れられません。", "{label} can't be empty.": "{label}は空にできません。",
  "Change the permalink from “{a}” to “{b}”? Links to the old address, from other sites or saved by people, will stop working.":
    "パーマリンクを「{a}」から「{b}」に変えますか？ 他のサイトからのリンクや保存されたリンクなど、古いアドレスへのリンクは使えなくなります。",
  "Change it": "変更する", "Paste": "貼り付ける", " and ": "、",
  "Another item already has the permalink “{v}”. Each one needs its own.": "パーマリンク「{v}」はすでに別の項目で使われています。項目ごとに別のものが必要です。",
  "Nothing to paste here.": "ここに貼り付けられるものがありません。",
  "Change {n} cell": "{n} 個のセルを変更", "Change {n} cells": "{n} 個のセルを変更", "add {n} new row": "{n} 行を追加", "add {n} new rows": "{n} 行を追加",
  "{n} cell that already has something in it will be replaced.": "入力済みの {n} 個のセルが置き換わります。", "{n} cells that already have something in them will be replaced.": "入力済みの {n} 個のセルが置き換わります。",
  "That includes {n} permalink: links to its old address will stop working.": "そのうち {n} 個はパーマリンクで、古いアドレスへのリンクは使えなくなります。",
  "That includes {n} permalinks: links to their old addresses will stop working.": "そのうち {n} 個はパーマリンクで、古いアドレスへのリンクは使えなくなります。",
  "Added {n} row": "{n} 行を追加しました", "Added {n} rows": "{n} 行を追加しました",
  "{n} value didn't fit its column and was left out.": "{n} 個の値が列に合わず、入れませんでした。", "{n} values didn't fit their columns and were left out.": "{n} 個の値が列に合わず、入れませんでした。",
  "Copied {n} row": "{n} 行をコピーしました", "Copied {n} rows": "{n} 行をコピーしました", "Couldn't copy.": "コピーできませんでした。",
  "This needs filling in before your changes can be saved.": "変更を保存するには、ここを入力してください。",
  "Not saved: {fields} can't be empty.": "保存されていません：{fields}は空にできません。",
  "Changing the permalink changes this page's address: links to the old one (…/{was}/), from other sites or saved by people, will stop working.":
    "パーマリンクを変えるとこのページのアドレスが変わり、古いアドレス（…/{was}/）へのリンクは使えなくなります。",
};
