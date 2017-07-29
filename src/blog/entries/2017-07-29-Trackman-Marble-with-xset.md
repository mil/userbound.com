---
title: Trackman Marble with xset
categories: blog
date: 2017-07-29
footnotes:
  - Make sure to install xset and libinput
---

The [Trackman Marble](https://www.logitech.com/en-us/product/trackman-marble) is a great mouse I've been using for over a decade now. By default on linux / within X, scrolling funcionality doesnt not work. Instead, by default the small mouse buttons act as browser forward/back. Because, I've had to set this up so many times with Xorg's `/etc/X11/Xorg.conf`, and that feels very 2005 at this point, I've moved over to a small userland script.

Using [xset](https://www.x.org/archive/X11R7.5/doc/man/man1/xset.1.html) w/ [libinput](https://www.freedesktop.org/wiki/Software/libinput/) I've found is the most pain-free solution to set the mouse to your liking. For my purposes, really all I wanted was to hold down the left small button in order to access a scroll modifier. So you hold the button and then you can use the trackball for scrolling. Well, that's enough blathering, here's the script I use<sup>1</sup>:

<pre data-language='bash'>
#!/usr/bin/env bash
xinput set-prop "Logitech USB Trackball" "libinput Scroll Method Enabled" "0" "0" "1"
xinput set-prop "Logitech USB Trackball" "libinput Horizontal Scroll Enabled" "0"
xinput set-prop "Logitech USB Trackball" "libinput Drag Lock Buttons" "8"
xinput set-prop "Logitech USB Trackball" "libinput Button Scrolling Button" "8"
</pre>
