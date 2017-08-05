---
title: Host-Specific i3 Config Variables
categories: blog
date: 2017-08-04
footnotes:
  - i3 reads the Xresources properties currently applied; so <code>xrdb ~/.Xresources</code> after making changes to <code>.Xresources</code>
  - Link to <a href="https://i3wm.org/docs/userguide.html#xresources">i3's docs on reading Xresouce properties into variables</a>
---

i3 doesn't let you define conditionals for per-host settings.  So say you want to make your font larger *only* on your machine that has a 4k display (using 1 `.i3/config`) that becomes difficult.. However, as you may or may not know, you *can* define per-host conditionals in your `.Xresources` file using an `#ifdef`. Further, as it turns out; i3 now supports *reading* Xresources properties. As such, sharing an i3 config between hosts applying slightly different variables on each host for specific items is now trivial.

In your `.Xresources` put something like:
<pre data-language='bash'>
urxvt.font: xft:Monospace:pixelsize=10
#ifdef SRVR_somehostname
  urxvt.font: xft:Monospace:pixelsize=20
  *i3font: pango:Monospace 20
#endif
</pre>

and then in your `.i3/config`, use i3's new `set_from_resource` command like so:
<pre data-language='bash'>
set_from_resource $i3font i3wm.i3font pango:Monospace 10font $i3font
font $i3font
</pre>

And that's it. By default on normal hosts, your font will be size 10; and on your `somehostname` host, your font size will be 20 in both urxvt and i3. Rinse and repeat for other variables you might want to change.<sup>1</sup><sup>2</sup>
