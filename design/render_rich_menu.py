from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
W, H = 2500, 1686
FONT_PATH = r"C:\Windows\Fonts\NotoSansTC-VF.ttf"


def font(size, weight="Medium"):
    face = ImageFont.truetype(FONT_PATH, size=size)
    face.set_variation_by_name(weight)
    return face


def fit_background():
    source = Image.open(ROOT / "carat-prism-background.png").convert("RGB")
    return ImageOps.fit(source, (W, H), method=Image.Resampling.LANCZOS).convert("RGBA")


def rounded(draw, box, radius, fill, outline=(255, 255, 255, 238), width=4):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, size, fill, weight=None, anchor=None, spacing=8):
    resolved_weight = weight or ("Bold" if size >= 38 else "Medium")
    draw.multiline_text(xy, value, font=font(size, resolved_weight), fill=fill, anchor=anchor, spacing=spacing, align="left")


def tab(draw, box, label, active):
    fill = (132, 137, 205, 242) if active else (255, 255, 255, 218)
    color = (255, 255, 255, 255) if active else (101, 111, 153, 255)
    rounded(draw, box, 40, fill, width=5)
    cx = (box[0] + box[2]) // 2
    cy = (box[1] + box[3]) // 2
    text(draw, (cx, cy), label, 88, color, weight="Bold", anchor="mm")


def card(draw, box, title, subtitle, icon, fill, color):
    rounded(draw, box, 30, fill)
    text(draw, (box[0] + 42, box[1] + 28), icon, 92, color, weight="Bold")
    title_y = box[3] - (286 if "\n" in title else 204)
    text(draw, (box[0] + 42, title_y), title, 96, color, weight="Bold", spacing=0)
    text(draw, (box[0] + 42, box[3] - 82), subtitle, 42, (*color[:3], 245), weight="Bold")


def hero(draw, support=False):
    box = (28, 272, 988, 1658)
    fill = (246, 241, 255, 242) if support else (247, 250, 255, 242)
    rounded(draw, box, 34, fill)
    text(draw, (82, 322), "◇", 52, (215, 119, 166, 255), weight="Bold")
    text(draw, (153, 334), "SEVENTEEN CARAT 繁中情報站", 36, (84, 75, 132, 255), weight="Bold")
    if support:
        text(draw, (88, 535), "TEAM SVT · 一起應援", 43, (190, 72, 137, 255), weight="Bold")
        text(draw, (82, 620), "CARAT\n應援專區", 138, (48, 61, 112, 255), weight="Bold", spacing=0)
        text(draw, (84, 1010), "演唱會、發行、投票、應援任務\n重要期限不錯過", 50, (70, 78, 124, 255), weight="Bold", spacing=18)
        cta_fill = (137, 106, 190, 255)
        cta_label = "查看本週任務"
    else:
        text(draw, (88, 535), "GLOBAL NEWS · 繁中整理", 43, (195, 72, 137, 255), weight="Bold")
        text(draw, (82, 620), "今日\n最新情報", 138, (48, 61, 112, 255), weight="Bold", spacing=0)
        text(draw, (84, 1010), "全球官方消息、媒體報導與行程\n中文化整理、重複比對", 50, (70, 78, 124, 255), weight="Bold", spacing=18)
        cta_fill = (200, 112, 163, 255)
        cta_label = "查看今日焦點"
    rounded(draw, (82, 1472, 930, 1604), 30, cta_fill, outline=None, width=0)
    text(draw, (126, 1537), cta_label, 66, (255, 255, 255, 255), weight="Bold", anchor="lm")
    text(draw, (873, 1537), "→", 66, (255, 255, 255, 255), weight="Bold", anchor="mm")


def render_news():
    im = fit_background()
    draw = ImageDraw.Draw(im, "RGBA")
    tab(draw, (28, 28, 1241, 248), "最新情報", True)
    tab(draw, (1259, 28, 2472, 248), "應援・市集　→", False)
    hero(draw, support=False)
    card(draw, (1012, 272, 1730, 771), "官方公告", "PLEDIS · Weverse · 各地官網", "官", (255, 240, 247, 244), (128, 75, 105, 255))
    card(draw, (1754, 272, 2472, 771), "最新影片", "MV · GOING · 舞台 · 幕後", "▶", (237, 245, 255, 244), (63, 95, 141, 255))
    card(draw, (1012, 795, 1730, 1294), "13位成員", "依本命快速查看個人動態", "◇", (246, 240, 255, 244), (101, 85, 139, 255))
    card(draw, (1754, 795, 2472, 1294), "活動行事曆", "演唱會 · 發行 · 直播 · 生日", "▦", (255, 252, 248, 244), (107, 90, 121, 255))
    rounded(draw, (1012, 1318, 2472, 1658), 30, (143, 122, 198, 248))
    text(draw, (1068, 1380), "♡", 86, (255, 255, 255, 255), weight="Bold")
    text(draw, (1185, 1364), "分享給 CARAT 好友", 88, (255, 255, 255, 255), weight="Bold")
    text(draw, (1188, 1490), "把情報站分享給一起應援的朋友", 46, (255, 255, 255, 245), weight="Bold")
    text(draw, (2377, 1488), "↗", 75, (255, 255, 255, 255), anchor="mm")
    save(im, ROOT / "seventeen-rich-menu-news.png")


def render_support():
    im = fit_background()
    draw = ImageDraw.Draw(im, "RGBA")
    tab(draw, (28, 28, 1241, 248), "←　最新情報", False)
    tab(draw, (1259, 28, 2472, 248), "應援・市集", True)
    hero(draw, support=True)
    card(draw, (1012, 272, 1730, 791), "演唱會\n與售票", "場次 · 售票 · 入場提醒", "票", (237, 245, 255, 244), (63, 95, 141, 255))
    card(draw, (1754, 272, 2472, 791), "新歌與\n專輯", "發行資訊與官方收聽入口", "♫", (255, 240, 247, 244), (128, 75, 105, 255))
    card(draw, (1012, 815, 1730, 1334), "投票任務", "期限與官方投票連結", "✓", (246, 240, 255, 244), (101, 85, 139, 255))
    card(draw, (1754, 815, 2472, 1334), "應援企劃", "活動公告與參與方式", "♡", (255, 252, 248, 244), (107, 90, 121, 255))
    rounded(draw, (1012, 1358, 2472, 1658), 30, (255, 255, 255, 244))
    text(draw, (1068, 1380), "市", 92, (104, 87, 162, 255), weight="Bold")
    text(draw, (1185, 1368), "CARAT 收藏市集", 96, (62, 66, 124, 255), weight="Bold")
    text(draw, (1188, 1503), "免費刊登收藏品・成交才收交易手續費", 46, (82, 86, 137, 255), weight="Bold")
    text(draw, (2374, 1508), "→", 70, (114, 102, 165, 255), anchor="mm")
    save(im, ROOT / "seventeen-rich-menu-support.png")


def save(image, path):
    # LINE rich-menu images need to stay compact; adaptive quantization keeps the text crisp.
    output = image.convert("RGB").quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    output.save(path, format="PNG", optimize=True, compress_level=9)


if __name__ == "__main__":
    render_news()
    render_support()
