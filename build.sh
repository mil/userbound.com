#!/usr/bin/env bash
cd "$(dirname "$0")"
docker build -t userbound.com .
docker rm -f userbound.com_inst
docker run \
  --name userbound.com_inst \
  -p 4000:4000 \
  -v `pwd`/lib:/app/lib \
  -v `pwd`/src:/app/src \
  -v `pwd`/docs:/app/docs \
  --rm \
  --net host \
  -it userbound.com gulp
