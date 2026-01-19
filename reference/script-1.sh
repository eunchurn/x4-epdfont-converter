#!/bin/bash

source reference/venv/bin/activate && python reference/ttf_to_epdfont.py kopub-batang 28 'reference/ttf-fonts/KoPub Batang Light.ttf' \
    --2bit \
    --line-height 1.2 \
    --letter-spacing 0 \
    --width-scale 1.0 \
    --baseline-offset 0 \
    -o reference/converted_fonts/kopub_batang_28_2bit.epdfont