/**
 * Shadowboxing: CS 247 P2
 * -----------------------
 * Questions go to Piazza: https://piazza.com/stanford/winter2013/cs247/home
 * Performs background subtraction on a webcam or kinect driver to identify
 * body outlines. Relies on HTML5: <video> <canvas> and getUserMedia().
 * Feel free to configure the constants below to your liking.
 * 
 * Created by Michael Bernstein 2013
 */

// Student-configurable options below...

// show the after-gaussian blur camera input
SHOW_RAW = false;
// show the final shadow
SHOW_SHADOW = true;
// input option: kinectdepth (kinect depth sensor), kinectrgb (kinect camera), 
// or webcam (computer camera)
var INPUT = "webcam"; 
// A difference of >= SHADOW_THRESHOLD across RGB space from the background
// frame is marked as foreground
var SHADOW_THRESHOLD = 10;
var SHADOW_THRESHOLD_CMP_ORIGINAL = 30;
// Between 0 and 1: how much memory we retain of previous frames.
// In other words, how much we let the background adapt over time to more recent frames
var BACKGROUND_ALPHA = 0.05;
// We run a gaussian blur over the input image to reduce random noise 
// in the background subtraction. Change this radius to trade off noise for precision 
var STACK_BLUR_RADIUS = 10; 


//Volume server data
var volumeServer = {timer:null, target:0.0, lastTarget:0.0, twoAgoTarget:0.0, threeAgoTarget:0.0, fourAgoTarget:0.0, current:0.0, audioStreamOneActive: true, inTransition: false, transitionStartTime: null, currentTier: 0, targetTier: 0, transitionTarget: 0, serverRunning:false, startTime: null};
var TRANSITION_LENGTH = 5000;

// TODO: start songs at middle, only at the funky parts

/*
 * Begin shadowboxing code
 */
var mediaStream, video, rawCanvas, rawContext, shadowCanvas, shadowContext, background, background_fixed = null;
var kinect, kinectSocket = null;
var audioelem, audioelemTwo, audiochangefreq = null;
var num_pixels = null;
var tier0_count, tier1_count, tier2_count, tier3_count;
var timeInBetween, timeAtSongChange = null;
var currTier, numFrames;

var started = false;

$(document).ready(function() {
    initializeDOMElements();

    $("#background").attr('disabled', true);
	if (INPUT == "kinectdepth" || INPUT == "kinectrgb") {
		setUpKinect();
	} else if (INPUT == "webcam") {
		setUpWebCam();
	}

    $('#background').click(function() {
        setBackground();
        volumeServer.timer = setInterval (adjustVolume, 30);
        volumeServer.serverRunning = true;
        volumeServer.startTime = (new Date).getTime();
        audiochangefreq = 0;
        audioelem = newAudio(0);
        audioelem.play();
        timeAtSongChange = new Date().getTime();
        timeInBetween = 0;
        currTier = 0;
        numFrames = 0;
        tier0_count = 0;
        tier1_count = 0;
        tier2_count = 0;
        tier3_count = 0;
        setInterval(considerChangingSong, 20000); // consider changing song every 5 secs
        if (!started) {
            renderShadow();
        }
    });
});

/*
 * Creates the video and canvas elements
 */
function initializeDOMElements() {
    video = document.createElement('video');
    video.setAttribute('autoplay', true);
    video.style.display = 'none';
    
    rawCanvas = document.createElement('canvas');
    rawCanvas.setAttribute('id', 'rawCanvas');
    rawCanvas.setAttribute('width', 640);
    rawCanvas.setAttribute('height', 480);
    rawCanvas.style.display = SHOW_RAW ? 'block' : 'none';
    document.getElementById('capture').appendChild(rawCanvas);
    rawContext = rawCanvas.getContext('2d'); // context that allows us to draw to canvas
    // mirror horizontally, so it acts like a reflection
    rawContext.translate(rawCanvas.width, 0);
    rawContext.scale(-1,1);    
    
    shadowCanvas = document.createElement('canvas');
    shadowCanvas.setAttribute('id', 'shadowCanvas');
    shadowCanvas.setAttribute('width', 640);
    shadowCanvas.setAttribute('height', 480);
    shadowCanvas.style.display = SHOW_SHADOW ? 'block' : 'none';
    document.getElementById('capture').appendChild(shadowCanvas);
    shadowContext = shadowCanvas.getContext('2d'); // context the allows us to draw to canvas
}


/*
 * Starts the connection to the Kinect
 */
function setUpKinect() {
	kinect.sessionPersist()
		  .modal.make('css/knctModal.css')
		  .notif.make();
		  
	kinect.addEventListener('openedSocket', function() {
		startKinect();
	});
}

/*
 * Starts the socket for depth or RGB messages from KinectSocketServer
 */
function startKinect() {
	if (INPUT != "kinectdepth" && INPUT != "kinectrgb") {
		console.log("Asking for incorrect socket from Kinect.");
		return;
	}
	
	if(kinectSocket)
	{
		kinectSocket.send( "KILL" );
		setTimeout(function() {
			kinectSocket.close();
			kinectSocket.onopen = kinectSocket.onmessage = kinectSocket = null;
		}, 300 );
		return false;
	}
	
	// Web sockets
	if (INPUT == "kinectdepth") {
		kinectSocket = kinect.makeDepth(null, true, null);
	} else if (INPUT == "kinectrgb") {
		kinectSocket = kinect.makeRGB(null, true, null);
	}

	kinectSocket.onopen = function() {
	};
	
	kinectSocket.onclose = kinectSocket.onerror = function() {
		kinectSocket.onclose = kinectSocket.onerror = null;
		return false;
	};

	kinectSocket.onmessage = function( e ) {
		if (e.data.indexOf("data:image/jpeg") == 0) {
			var image = new Image();
			image.src = e.data;
			image.onload = function() {
				rawContext.drawImage(image, 0, 0, 640, 480);
			}
			return false;
		}
	};
}

/*
 * Starts webcam capture
 */
function setUpWebCam() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (!navigator.getUserMedia) { 
        console.log("Browser does not support getUserMedia. Try a latest version of Chrome/Firefox");
        alert("not supported");
    }
    window.URL = window.URL || window.webkitURL;
    
    video.addEventListener('canplay', function() {
        if ($('#background').attr('disabled')) {
            $('#background').attr('disabled', false);
        }
    }, false);
    
    var failVideoStream = function(e) {
      console.log('Failed to get video stream', e);
    };
    
    navigator.getUserMedia({video: true, audio:false}, function(stream) {
        mediaStream = stream;
        
        if (navigator.mozGetUserMedia) {
          video.mozSrcObject = stream;
          video.play();
        } else {
          video.src = window.URL.createObjectURL(stream);
        }        
      }, failVideoStream);
}

/*
 * Gets an array of the screen pixels. The array is 4 * numPixels in length,
 * with [red, green, blue, alpha] for each pixel.
 */
function getCameraData() {
    if (mediaStream || kinect) {
        rawContext.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height);
        stackBlurCanvasRGB('rawCanvas', 0, 0, rawCanvas.width, rawCanvas.height, STACK_BLUR_RADIUS);        
        var pixelData = rawContext.getImageData(0, 0, rawCanvas.width, rawCanvas.height);
        return pixelData;
    }    
}

/*
 * Remembers the current pixels as the background to subtract.
 */
function setBackground() {
    var pixelData = getCameraData();
    num_pixels = pixelData.data.length/4;
    background = pixelData;
    background_fixed = new Object();
    background_fixed.data = new Array();
    for (var i=0; i<pixelData.data.length; i=i+4) {
        background_fixed.data[i] = pixelData.data[i];
        background_fixed.data[i+1] = pixelData.data[i+1];
        background_fixed.data[i+2] = pixelData.data[i+2];
        background_fixed.data[i+3] = pixelData.data[i+3];
    }
}

/*
 * In a loop: gets the current frame of video, thresholds it to the background frames,
 * and outputs the difference as a shadow.
 */
function renderShadow() {
  if (!background) {
    return;
  }

  pixelData = getShadowData();
  shadowContext.putImageData(pixelData, 0, 0);
  setTimeout(renderShadow, 0);
}

function newAudio(tier){
    var audiotag = document.createElement('audio');
    
    //Source enumeration
    if (tier == 0) {
		audiotag.src = "../audio/sonata.mp3";
    } else if (tier == 1) {
	    audiotag.src = "../audio/lacamisa.m4a";
	} else if (tier == 2) {
		audiotag.src = "../audio/beatit.m4a";
    } else if (tier == 3){
	    audiotag.src = "../audio/barbra.mp3";
    }
    
    audiotag.preload = "auto";
    $("#audiodiv").append(audiotag);
    return audiotag;
}

function considerChangingSong(){
    console.log("considering changing song... | " + tier0_count + " | " + tier1_count + " | " + tier2_count + " | " + tier3_count);
    var total = tier0_count + tier1_count + tier2_count + tier3_count;
    if(total > 0){
        var tier0_frac = (tier0_count / total)*100;
        var tier1_frac = (tier1_count / total)*100;
        var tier2_frac = (tier2_count / total)*100;
        var tier3_frac = (tier3_count / total)*100;
        //console.log(tier1_frac + "|" + tier2_frac + "|" + tier3_frac + "|" + tier4_frac);
        if(tier0_frac > 50){
            tier0_count = 0;
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            if(currTier != 0){
                setSongToTier(0);
            }
        } else if(tier1_frac > 50){
            tier0_count = 0;
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            if(currTier != 1){
                setSongToTier(1);
            }
        } else if(tier2_frac > 50){
            tier0_count = 0;
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            if(currTier != 2){
                setSongToTier(2);
            }
        } else if(tier3_frac > 50){
            tier0_count = 0;
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            if(currTier != 3){
                setSongToTier(3);
            }
        }
    }

    // another way is to see if any of them is more than 50%, and only then change.
    //var max = Math.max(tier1_frac, tier2_frac, tier3_frac, tier4_frac);
    /*if(max == tier1_frac){
        if(currTier != 1){
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            tier4_count = 0;
            changeSongToTier(1);
        }
    } else if(max == tier2_frac){
        if(currTier != 2){
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            tier4_count = 0;
            changeSongToTier(2);   
        }
    } else if(max == tier3_frac){
        if(currTier != 3){
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            tier4_count = 0;
            changeSongToTier(3);
        }
    } else if(max == tier4_frac){
        if(currTier != 4){
            tier1_count = 0;
            tier2_count = 0;
            tier3_count = 0;
            tier4_count = 0;
            changeSongToTier(4);
        }
    }*/
}

function inc(val){
    if(val == 0){
        tier0_count += 1;
    } else if(val == 1){
        tier1_count += 1;
    } else if(val == 2){
        tier2_count += 1;
    } else if(val == 3){
        tier3_count += 1;
        // what happens if I put in a request for a song and server decides to not play it yet because minimum time has not yet passed, and then I put in another request after that?
    }
}

function compareToOriginalImage(pixelData){
    // need to compare pixelData with background_fixed
    // count the number of pixels that are different
    // change genre depending on how many pixels are different

    var count2 = 0; // number of pixels that are different from the original image

    // Each pixel gets four array indices: [r, g, b, alpha]
    for (var i=0; i<pixelData.data.length; i=i+4) {
        var rCurrent = pixelData.data[i];
        var gCurrent = pixelData.data[i+1];
        var bCurrent = pixelData.data[i+2];
        
        var rBackground = background_fixed.data[i];
        var gBackground = background_fixed.data[i+1];
        var bBackground = background_fixed.data[i+2];
        
        var distance = pixelDistance(rCurrent, gCurrent, bCurrent, rBackground, gBackground, bBackground);        

        if (distance >= SHADOW_THRESHOLD_CMP_ORIGINAL) {
            count2 += 1;
        }
    }

    if(count2 <= num_pixels/4){
        inc(0);
    } else if(count2 > num_pixels/4 && count2 <= num_pixels/2){
        inc(1);
    } else if(count2 > num_pixels/2 && count2 <= (3*num_pixels)/4){
        inc(2);
    } else if(count2 > (3*num_pixels)/4 && count2 <= num_pixels){
        inc(3);
    }
}

function setSongToTier(tier) {
	volumeServer.targetTier = tier;
    currTier = tier;

    console.log("Changing song to tier " + tier + "!");

    // time difference from last song change
    var prevTimeAtSongChange = timeAtSongChange;
    timeAtSongChange = new Date().getTime();
    timeInBetween = timeAtSongChange - prevTimeAtSongChange;
    console.log(timeInBetween/1000 + "seconds from last change!");
}

function adjustedTransitionFraction(rawFraction) {
	var newFraction;
	if (rawFraction <= 1.0) newFraction = 0;
	else {
		var newInput = rawFraction - 1.0;
		newFraction = 3*Math.pow(newInput, 2) - 2*Math.pow(newInput, 3);
	}
	if (rawFraction >= 2.0) newFraction = 1;
	return newFraction;
}



function adjustVolume() {	
	//Check for song transition
	var timeElapsed = (new Date).getTime() - volumeServer.startTime;
	//console.log("Elapsed: " + timeElapsed + ", target: " + volumeServer.targetTier + ", current: " + volumeServer.currentTier);
	if (volumeServer.targetTier != volumeServer.currentTier && timeElapsed >= 20000) {
		volumeServer.inTransition = true;
		volumeServer.transitionTarget = volumeServer.targetTier;
		volumeServer.transitionStartTime = (new Date).getTime();
		volumeServer.startTime = (new Date).getTime();
		if (volumeServer.audioStreamOneActive) {
			volumeServer.audioStreamOneActive = false;
			audioelemTwo = newAudio(volumeServer.targetTier);
			audioelemTwo.play();
			audioelemTwo.volume = 0;
		} else {
			volumeServer.audioStreamOneActive = true;
			audioelem = newAudio(volumeServer.targetTier);
			audioelem.play();
			audioelem.volume = 0;
		}
	}
	
	//Determine new volume by smoothing over last five target volumes
	var currentVolume;
	if (volumeServer.inTransition) currentVolume = audioelem.volume + audioelemTwo.volume;
	else if (volumeServer.audioStreamOneActive) currentVolume = audioelem.volume;
	else currentVolume = audioelemTwo.volume;
	
	var newDifference = volumeServer.target - currentVolume;
	var lastDifference = volumeServer.lastTarget - currentVolume;
	var twoAgoDifference = volumeServer.twoAgoTarget - currentVolume;
	var threeAgoDifference = volumeServer.threeAgoTarget - currentVolume;
	var fourAgoDifference = volumeServer.fourAgoTarget - currentVolume;

	var difference = (newDifference + lastDifference + twoAgoDifference + threeAgoDifference + fourAgoDifference) / 5;
	
	var newVolume = currentVolume + difference*0.05;
	//console.log("ACTUAL VOLUME: " + audioelem.volume);
	
	//Adjust volume to case
	if (volumeServer.inTransition) {
		var transitionFraction = ((new Date).getTime() - volumeServer.transitionStartTime) / TRANSITION_LENGTH;
		transitionFraction = adjustedTransitionFraction(transitionFraction);
		console.log("Transition fraction: " + transitionFraction);
		if (transitionFraction >= 1) {
			transitionFraction = 1;
			volumeServer.inTransition = false;
			volumeServer.currentTier = volumeServer.transitionTarget;
			if (volumeServer.audioStreamOneActive) audioelemTwo.parentNode.removeChild(audioelemTwo);
			else audioelem.parentNode.removeChild(audioelem);
		}
		
		if (volumeServer.audioStreamOneActive) {
			audioelem.volume = transitionFraction*newVolume;
			audioelemTwo.volume = (1 - transitionFraction)*newVolume;
		} else {
			audioelemTwo.volume = transitionFraction*newVolume;
			audioelem.volume = (1 - transitionFraction)*newVolume;
		}
		//console.log("Volume One: " + audioelem.volume + ", Volume Two: " + audioelemTwo.volume);
	} else {
		if (volumeServer.audioStreamOneActive) {
			audioelem.volume = newVolume;
		} else {
			audioelemTwo.volume = newVolume;
		}
	}
}


//Volume level between 0 and 1
function setVolumeToLevel(level) {
	if (level > 1 || level < 0) return;
	else {
		volumeServer.fourAgoTarget = volumeServer.threeAgoTarget;
		volumeServer.threeAgoTarget = volumeServer.twoAgoTarget;
		volumeServer.twoAgoTarget = volumeServer.lastTarget;
		volumeServer.lastTarget = volumeServer.target;
		volumeServer.target = level;
	}
}
/*
 * Returns an ImageData object that contains black pixels for the shadow
 * and white pixels for the background
 */

function getShadowData() {
    var pixelData = getCameraData(); // get current frame from camera
    compareToOriginalImage(pixelData);
    var count = 0;
    //console.log("audiochangefreq increased by one: " + audiochangefreq);
    //if(audiochangefreq > 100){
      //  console.log("yo");
    //}

    // Each pixel gets four array indices: [r, g, b, alpha]
    for (var i=0; i<pixelData.data.length; i=i+4) {
        var rCurrent = pixelData.data[i];
        var gCurrent = pixelData.data[i+1];
        var bCurrent = pixelData.data[i+2];
        
        var rBackground = background.data[i];
        var gBackground = background.data[i+1];
        var bBackground = background.data[i+2];
        
        background.data[i] = pixelData.data[i];
        background.data[i+1] = pixelData.data[i+1];
        background.data[i+2] = pixelData.data[i+2];
        		
        var distance = pixelDistance(rCurrent, gCurrent, bCurrent, rBackground, gBackground, bBackground);        
        
        if (distance >= SHADOW_THRESHOLD) {
            // foreground, show shadow
            pixelData.data[i] = 0;
            pixelData.data[i+1] = 0;
            pixelData.data[i+2] = 0;
            count += 1;
        } else {
            // background
            
            //  update model of background, since we think this is in the background
            updateBackground(i, rCurrent, gCurrent, bCurrent, rBackground, gBackground, bBackground);
            
            // now set the background color
            pixelData.data[i] = 255;
            pixelData.data[i+1] = 255;
            pixelData.data[i+2] = 255;
            pixelData.data[i+3] = 0;
        }
    }
    //console.log(count);
    
    //audiochangefreq += 1;
    //if(audiochangefreq > 100){
        //console.log(count);
        /*if(count < 50000){
            audioelem.volume = 0;
            console.log("volume changed to 0!");
            audiochangefreq = 0;
        } else if(count >= 50000){
            audioelem.volume = 1;
            console.log("volume changed to 1!");
            audiochangefreq = 0;
        }*/

        if(count < 1000){
            setVolumeToLevel(0.05);
            //console.log("volume changed to 0.0!");
        } else if(count >= 1000 && count < 10000){
            setVolumeToLevel(0.25);
            //console.log("volume changed to 0.2!");
        } else if(count >= 10000 && count < 50000){
            setVolumeToLevel(0.5);
            //console.log("volume changed to 0.4!");
        } else if(count >= 50000 && count < 100000){
            setVolumeToLevel(0.7);
            //console.log("volume changed to 0.6!");
        } else if(count >= 100000 && count < 200000){
            setVolumeToLevel(0.9);
            //console.log("volume changed to 0.8!");
        } else if(count >= 200000 && count < 300000){
            setVolumeToLevel(1.0);
            //console.log("volume changed to 1!");
        }
    //}

    //background = pixelData;

    //console.log("volume: " + audioelem.volume);
    
    return pixelData; 
}

function updateBackground(i, rCurrent, gCurrent, bCurrent, rBackground, gBackground, bBackground) {
    background.data[i] = Math.round(BACKGROUND_ALPHA * rCurrent + (1-BACKGROUND_ALPHA) * rBackground);
    background.data[i+1] = Math.round(BACKGROUND_ALPHA * gCurrent + (1-BACKGROUND_ALPHA) * gBackground);
    background.data[i+2] = Math.round(BACKGROUND_ALPHA * bCurrent + (1-BACKGROUND_ALPHA) * bBackground);
}

/*
 * Returns the distance between two pixels in grayscale space
 */
function pixelDistance(r1, g1, b1, r2, g2, b2) {
    return Math.abs((r1+g1+b1)/3 - (r2+g2+b2)/3);
}