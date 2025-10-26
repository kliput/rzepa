#!/bin/bash

cd output
find "$1" -name "*.html" | xargs -L 1 -I '{}' node ../index.js '{}' &