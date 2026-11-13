#!/usr/bin/env python3
"""'엑셀 찾기' 아이콘 만들기 → scripts/kmong/icon.png(256, 창·탭 아이콘) · scripts/kmong/엑셀찾기.ico(바탕화면 바로 가기 아이콘).

- 모양: 밝은 타일 위에 초록 표(격자) + 돋보기. 크몽 메인 이미지(marketing/kmong/setup-main.html)의 아이콘과 같은 그림.
  엑셀 로고가 아니라 직접 그린 그림이다(남의 로고를 쓰면 안 됨).
- 4배로 크게 그린 뒤 줄여서 가장자리를 부드럽게 한다. ico 안의 그림은 BMP 형식(옛 프로그램도 읽게).
사용: python3 scripts/kmong/make-icon.py   (pip install pillow)
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
S = 4            # 크게 그리는 배수
N = 256 * S      # 그리는 크기
U = N / 56       # 원래 그림은 56칸 기준

TILE, EDGE, GREEN, LINE = (255, 253, 248, 255), (207, 200, 184, 255), (29, 107, 63, 255), (255, 253, 248, 191)

def box(x0, y0, x1, y1):
    return [round(x0 * U), round(y0 * U), round(x1 * U), round(y1 * U)]

def round_line(d, x0, y0, x1, y1, w, fill):
    d.line([x0 * U, y0 * U, x1 * U, y1 * U], fill=fill, width=round(w * U))
    r = w * U / 2
    for x, y in ((x0, y0), (x1, y1)):
        d.ellipse([x * U - r, y * U - r, x * U + r, y * U + r], fill=fill)

def draw():
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(box(1, 1, 55, 55), radius=round(11 * U), fill=TILE, outline=EDGE, width=round(0.6 * U))
    d.rounded_rectangle(box(10, 10, 38, 42), radius=round(2.5 * U), fill=GREEN)
    grid = Image.new('RGBA', (N, N), (0, 0, 0, 0))            # 격자 줄은 살짝 비치게
    g = ImageDraw.Draw(grid)
    for y in (19.5, 27, 34.5):
        g.line([10 * U, y * U, 38 * U, y * U], fill=LINE, width=round(1.8 * U))
    g.line([20 * U, 10 * U, 20 * U, 42 * U], fill=LINE, width=round(1.8 * U))
    im = Image.alpha_composite(im, grid)
    d = ImageDraw.Draw(im)
    round_line(d, 41.5, 41.5, 48, 48, 4.6, GREEN)             # 돋보기 손잡이
    d.ellipse(box(35 - 10.8, 35 - 10.8, 35 + 10.8, 35 + 10.8), fill=GREEN)   # 돋보기 테
    d.ellipse(box(35 - 7.2, 35 - 7.2, 35 + 7.2, 35 + 7.2), fill=TILE)        # 돋보기 알
    return im

def main():
    big = draw()
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, 'icon.png'))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, '엑셀찾기.ico'), format='ICO', sizes=[(s, s) for s in sizes], bitmap_format='bmp')
    print('만듦: scripts/kmong/icon.png, scripts/kmong/엑셀찾기.ico')

if __name__ == '__main__':
    main()
