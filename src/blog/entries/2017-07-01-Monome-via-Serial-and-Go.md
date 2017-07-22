---
title: Monome via Serial and Go
categories: blog
date: 2017-07-01
footnotes:
  - The example Go code was tested on a non-varibright Monome Walnut 256 model.
---

If you have a [Monome](https://en.wikipedia.org/wiki/Monome), you're probably familiar with [serialosc](https://github.com/monome/serialosc) which does what its name implies - converts Monome's serial to OSC.  However, serialosc, isn't the only way to talk to these devices. You can talk serial directly to monomes fairly simply as well.

Below is a contrived example<sup>1</sup> using Go:

<pre data-language='golang'>
package main
import (
	"fmt"
	"io"
	"log"
	"time"
	"github.com/jacobsa/go-serial/serial"
)

func setLed(port io.ReadWriteCloser, position int, on bool) {
	var a, b byte
	if on {
		a, b = 1, 0x11
	} else {
		a, b = 2, 0x10
	}
	port.Write([]byte{(a << 4) + b, byte(position)})
}
func main() {
	port, err := serial.Open(serial.OpenOptions{
		PortName:        "/dev/ttyUSB0",
		BaudRate:        115200,
		DataBits:        8,
		StopBits:        1,
		MinimumReadSize: 1,
	})
	defer port.Close()
	if err != nil {
		log.Fatalf("Monome not found: %v", err)
	}
	// Read example, just print information
	go func() {
		readBytes := make([]byte, 2)
		for {
			port.Read(readBytes)
			fmt.Printf("%v\n", readBytes)
		}
	}()
	// Write example, cycle all leds off/on
	s := false
	for {
		for x := 0; x < 256; x++ {
			setLed(port, x, s)
		}
		s = !s
		time.Sleep(100 * time.Millisecond)
	}
}
</pre>

In the above snippet you get both reading and writing directly from/to the Monome's serial port. The [serial specification](http://monome.org/docs/serial.txt) is well laid out and working directly with serial rather than using serialosc might be a good option if you don't need all the fancy features (such as Bonjour or multi-device support) of serialosc or just want something a little more low-level.
