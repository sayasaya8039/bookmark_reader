"""
アイコン生成スクリプト
Pillowを使用してシンプルなアイコンを生成します
"""
from PIL import Image, ImageDraw

def create_icon(size: int, output_path: str):
    """グラデーション風のブックマークアイコンを生成"""
    # 画像を作成
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 背景の円（グラデーション風に2色）
    margin = size // 10

    # 紫のグラデーション（上から下）
    for i in range(size):
        # 667eea → 764ba2 のグラデーション
        r = int(102 + (118 - 102) * i / size)
        g = int(126 + (75 - 126) * i / size)
        b = int(234 + (162 - 234) * i / size)
        draw.line([(0, i), (size, i)], fill=(r, g, b, 255))

    # 角丸にするためのマスク
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = size // 4
    mask_draw.rounded_rectangle([0, 0, size-1, size-1], radius=radius, fill=255)

    # マスクを適用
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    result.paste(img, mask=mask)

    # ブックマーク/本のアイコンを描画
    icon_draw = ImageDraw.Draw(result)

    # 本のアイコンのサイズ計算
    book_margin = size // 4
    book_left = book_margin
    book_right = size - book_margin
    book_top = book_margin
    book_bottom = size - book_margin
    book_center = size // 2

    # 本の形（白色）
    white = (255, 255, 255, 255)

    # 左ページ
    icon_draw.polygon([
        (book_center, book_top + size//10),  # 上中央
        (book_left, book_top),                # 左上
        (book_left, book_bottom),             # 左下
        (book_center, book_bottom - size//10) # 下中央
    ], fill=white)

    # 右ページ
    icon_draw.polygon([
        (book_center, book_top + size//10),   # 上中央
        (book_right, book_top),               # 右上
        (book_right, book_bottom),            # 右下
        (book_center, book_bottom - size//10) # 下中央
    ], fill=white)

    # 中央の線（本の綴じ部分）
    line_color = (102, 126, 234, 200)
    line_width = max(1, size // 32)
    icon_draw.line(
        [(book_center, book_top + size//10), (book_center, book_bottom - size//10)],
        fill=line_color,
        width=line_width
    )

    # 保存
    result.save(output_path, 'PNG')
    print(f"Generated: {output_path}")

if __name__ == '__main__':
    # 各サイズのアイコンを生成
    create_icon(16, 'icons/icon16.png')
    create_icon(48, 'icons/icon48.png')
    create_icon(128, 'icons/icon128.png')
    print("Done!")
