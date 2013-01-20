Questions go to Piazza! https://piazza.com/stanford/winter2013/cs247/home

This starter code performs background subtraction on a webcam or kinect camera and produces an HTML <canvas> element with the foreground shadow. It relies on HTML5 elements such as <video> and <canvas>, so a recent browser is required.

To set up:
1. Make sure your browser supports getUserMedia(), which is a relatively recent addition to the HTML standard. We recommend using the latest version of Google Chrome. Other browsers (e.g., Firefox) may be supported with special configuration options: http://caniuse.com/stream. However, in our tests, Chrome is the most performant option.

2. getUserMedia() does not work from a file:/// handle, so you will need to host these files on a server. The simplest option while debugging is to use a built-in Python class to host the files locally. Install Python, then open up a terminal and navigate to the shadowboxing directory. Then, issue:
  python -m SimpleHTTPServer <portnumber>
<portnumber> is the port you'd like to host on, for example 8000. You should then be able to navigate your browser to http://localhost:<portnumber>, e.g., http://localhost:8000. Try http://localhost:8000/demo-shadow.html and http://localhost:8000/demo-stanford.html.

3. Some webcams, for example the Macbook's built-in iSight, will adjust their exposure continuously as new people enter and leave the frame. This can interfere with the background subtraction. If this is a problem for you, you will need to find a way to lock the exposure for your webcam. On Macs, you can install a demo of iGlasses, choose the iGlasses webcam instead of the built-in iSight when the browser asks, and click "lock exposure".

4. While we set some sane defaults for the background subtraction, you'll want to play with the parameters to find the optimal combination for your setting. Check out the top of shadowboxing.js. You might especially want to pay attention to:
- SHOW_RAW: for debugging, shows the webcam input after an initial filter that blurs away some webcam noise. (It will look like a Gaussian blur has been applied to your webcam.)
- STACK_BLUR_RADIUS: to remove random background noise, we blur the webcam input. If your hands are becoming too blob-like, decrease the blur radius. The image will become sharper, but the background might get noisy.
- SHADOW_THRESHOLD: the distance in grayscale space (0-255) that a pixel must be from the background image to be considered part of the foreground. So, if the grayscale background for a pixel is saved at value x, SHADOW_THRESHOLD is 10, then any time that pixel has the value x+/-10, it becomes part of the foreground shadow.
- BACKGROUND_ALPHA: between zero and one, how quickly we adapt the background to new frames. If alpha is high, and you stand still, you become part of the background over time.

Demos that can be run from the server:
- demo-shadow.html (e.g., http://localhost:8000/demo-shadow.html): a simple demo of the built-in background subtraction
- demo-stanford.html and js/demo-stanford.js (e.g., http://localhost:8000/demo-stanford.html): example application code, a "wave to reveal" app
