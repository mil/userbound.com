FROM debian:jessie
MAINTAINER mil
RUN apt-get -y update
RUN apt-get -y dist-upgrade
RUN apt-get -y install curl git


RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -
RUN apt-get install -y nodejs build-essential

RUN mkdir -p /app
WORKDIR /app

COPY Gulpfile.js package.json /app/

RUN npm install -g gulp
RUN npm install

EXPOSE 4000
ENTRYPOINT [ "gulp" ]
