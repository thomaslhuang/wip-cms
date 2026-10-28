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

// western: October 22, 2026 · japanese: 2026年10月22日 · era: 令和8年10月22日
export const dateStyle = () => read("wip-dates", lang() === "ja" ? "japanese" : "western");
export const setDateStyle = (s) => write("wip-dates", s);

export function t(text, vars) {
  let out = (lang() === "ja" && JA[text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}
// Title Case for names of fields, sections and settings ("featured image" -> "Featured
// Image", "seconds per image" -> "Seconds per Image"). Only in English; Japanese has no case.
const ACRONYMS = new Set(["html", "css", "url", "pdf", "rss", "seo", "id"]);
const SMALL = new Set(["a", "an", "the", "and", "or", "but", "nor", "for", "of", "on", "in", "at", "to", "by", "per", "vs", "via", "as", "with", "from"]);
export function titleCase(text) {
  if (lang() === "ja") return text;
  const words = String(text).split(/(\s+|(?=[(])|(?<=[(]))/);
  const real = words.filter((w) => /\w/.test(w));
  return words.map((w) => {
    if (!/[a-z]/.test(w) || /[A-Z]/.test(w.slice(1))) return w;          // "HTML", "iPhone", "(5px)": as they are
    const first = w === real[0], lastWord = w === real[real.length - 1];
    if (!first && !lastWord && SMALL.has(w.toLowerCase())) return w.toLowerCase();
    if (ACRONYMS.has(w.toLowerCase())) return w.toUpperCase();
    if (/^\d/.test(w)) return w;                                             // "16px"
    return w.replace(/(^|-)([a-z])/g, (m, p1, c) => p1 + c.toUpperCase());  // "multi-upload" -> "Multi-Upload"
  }).join("");
}
// a name, translated and in Title Case
export const tl = (text, vars) => titleCase(t(text, vars));

// one / many: t2(n, "{n} image", "{n} images")
export const t2 = (n, one, many, vars = {}) => t(n === 1 ? one : many, { n, ...vars });

// kind: weekday (Wed 22 / 22日(水)) · long (October 22, 2026) · short (Oct 22, 2026) · day (Oct 22) · month (October 2026)
//       monthName (October) · year (2026)
export function fmtDate(value, kind = "long", style = dateStyle()) {
  const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + "T12:00:00");
  if (isNaN(d)) return "";
  // the day within its month, for lists already grouped by month: "Wed 22" / "22日(水)"
  if (kind === "weekday") {
    if (style === "western") return d.toLocaleDateString("en-US", { weekday: "short" }) + " " + d.getDate();
    return `${d.getDate()}日(${d.toLocaleDateString("ja-JP", { weekday: "short" })})`;
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
  "Library": "ライブラリ", "Images": "画像", "Settings": "設定", "Pages": "ページ", "Sections": "セクション",
  "{n} change ready to publish": "公開待ちの変更 {n} 件", "{n} changes ready to publish": "公開待ちの変更 {n} 件",
  "Everything is published": "すべて公開済み",
  "No date": "日付なし", "Search": "検索", "Search {label}": "{label}を検索",
  "{n} item": "{n} 件", "{n} items": "{n} 件", ", {n} draft": "、下書き {n} 件", ", {n} drafts": "、下書き {n} 件",
  "New in {label}": "{label}に新規作成", "Show as": "表示方法", "List": "リスト", "Grid": "グリッド", "Titles only": "タイトルのみ",
  "Nothing matches.": "一致するものはありません。", "Nothing here yet.": "まだ何もありません。", "Resize list": "リストの幅を変更",
  "Expand all": "すべて開く", "Collapse all": "すべて閉じる",
  "Draft": "下書き", "Published": "公開中",
  "Title": "タイトル", "Permalink": "パーマリンク", "made from the title": "タイトルから作成",
  "New {kind}": "新規作成：{kind}",
  "The permalink follows the title unless you change it. New posts start as drafts.": "パーマリンクは、変更しない限りタイトルに合わせて作られます。新しい投稿は下書きから始まります。",
  "Cancel": "キャンセル", "Create": "作成", "Back": "戻る", "New": "新規", "Open": "開く", "Done": "完了", "Details": "詳細",
  // ----- toolbar and menus -----
  "Insert a block": "ブロックを挿入", "Add photos": "写真を追加", "Done rearranging": "並べ替えを終了", "Rearrange blocks": "ブロックを並べ替え",
  "Open on your site": "サイトで開く", "Open on your site (new tab)": "サイトで開く（新しいタブ）",
  "Hide details": "詳細を隠す", "Show details": "詳細を表示", "More": "その他",
  "Revert to when opened": "開いた時の状態に戻す", "Move to Trash": "ゴミ箱に移動",
  "Appearance": "外観", "Match my Mac": "Macに合わせる", "Light": "ライト", "Dark": "ダーク",
  "Themes, colors and fonts…": "テーマ・色・フォント…", "Language": "言語", "Dates": "日付の書き方",
  "View": "表示", "Write": "書く", "Split": "分割", "Preview": "プレビュー",
  "Live preview": "ライブプレビュー", "Preview size": "プレビューのサイズ", "Computer": "パソコン", "Phone": "スマホ",
  "Reload preview": "プレビューを再読み込み", "Live: shows changes as you type": "ライブ：入力するとすぐに反映されます",
  "Starting the preview…": "プレビューを起動中…", "Updating…": "更新中…",
  "Choose one of your {label}, or start a new one.": "{label}から選ぶか、新しく作成してください。",
  "Choose something from the sidebar.": "サイドバーから選んでください。",
  "There's no folder at {path}.": "{path} にフォルダがありません。",
  "Open a site": "サイトを開く", "Recent": "最近使ったサイト",
  "The site's main folder. In Finder, select the folder and press ⌥⌘C to copy its path, then paste it here. A folder that isn't set up for wip cms yet (a new client site, say) gets a few questions first.":
    "サイトのメインフォルダです。Finderでフォルダを選んで ⌥⌘C を押すとパスがコピーされるので、ここに貼り付けてください。まだ wip cms 用に設定されていないフォルダ（新しいクライアントのサイトなど）は、いくつか質問に答えてから開きます。",
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
  "Name in the sidebar": "サイドバーでの名前", "Folder": "フォルダ", "Kind": "種類", "Writing": "書き方", "Template": "テンプレート", "optional": "任意",
  "Posts": "投稿", "Text": "テキスト", "Blocks": "ブロック", "Add a section": "セクションを追加", "Remove {label}": "「{label}」を削除", "Set up": "設定する",
  "Title, featured image, date, draft, tags": "タイトル、アイキャッチ画像、日付、下書き、タグ", "Title and a short description": "タイトルと短い説明",
  "One piece of writing under the title (Markdown)": "タイトルの下に1つの文章（Markdown）",
  "Text, images, carousels, collages… (the site's templates must show blocks)": "テキスト、画像、カルーセル、コラージュ…（サイトのテンプレートがブロックに対応している必要があります）",
  "This looks like a {generator} site. ": "{generator} のサイトのようです。", "This looks like an {generator} site. ": "{generator} のサイトのようです。",
  "wip cms will write a .pages.yml file describing the sections below, and make their folders. Each post or page becomes its own folder with an index.md inside. You can change all of this later in .pages.yml.":
    "wip cms が下のセクションを記した .pages.yml を作り、それぞれのフォルダを作成します。投稿やページは1つずつ、中に index.md が入ったフォルダになります。すべて後から .pages.yml で変更できます。",
  "Posts get a title, featured image, date, draft switch and tags; pages get a title and a description. “Blocks” lets you mix text, images, carousels and collages, like your own site, but the client site's templates need to be able to show them. “Template” fills in the layout field (for Eleventy, e.g. post.njk).":
    "投稿にはタイトル、アイキャッチ画像、日付、下書きスイッチ、タグが、ページにはタイトルと説明が付きます。「ブロック」ではあなたのサイトのようにテキスト・画像・カルーセル・コラージュを組み合わせられますが、クライアントのサイトのテンプレートが対応している必要があります。「テンプレート」は layout 項目に入ります（Eleventy なら post.njk など）。",
  // ----- appearance -----
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
};
