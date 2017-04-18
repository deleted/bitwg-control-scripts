/*

Copyright 2014 Evan Bogunia_____evanbeta@keithmcmillen.com


*/

//Load the bitwig API, obviously.
loadAPI(2);

//Define/set our controller properties [ company, device, version, uuid ]
host.defineController("KMI", "QuNexusInsect", "1.0", "36f2e190-1f3e-11e7-9598-0800200c9a662");
host.defineMidiPorts(3, 3);

//Define/set input/output port names (both i/o are the same)
var portNames 	= 	["QuNexus Port 1", "QuNexus Port 2", "QuNexus Port 3"];
host.addDeviceNameBasedDiscoveryPair(portNames, portNames);
var midiIns = ["QuNexus", "MIDIIN2 (QuNexus)", "MIDIIN3 (QuNexus)"];
var midiOuts = ["QuNexus", "MIDIOUT2 (QuNexus)", "MIDIOUT3 (QuNexus)"];
host.addDeviceNameBasedDiscoveryPair(midiIns, midiOuts);


//Define/set sysex call/response (deprecated, included for good measure)
host.defineSysexDiscovery("F0 7E 7F 06 01 F7", "F0 7E 00 06 02 00 01 5F 19 00 00 00 ?? ?? ?? ?? ?? ?? F7");


//Declare some global vars for a few of the interface types defined in the API
var application, arranger, mixer, transport;
var HIGHEST_CC = 119;
var LOWEST_CC = 1;
var trackBank;
var launcherClips = {};
var clipsPlaying = [];

var CLIP_LAUNCH_PROBABILITY = 0.33;
// Define a list of note numbers
var WHITE_KEY_VALUES = [
  48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72
];
var BLACK_KEY_VALUES = [
  49, 51, 54, 56, 58, 61, 63, 66, 68, 70
];

// Fill an array with -1's, which can be used to disable note pass-through
// in MIDI handlers.
var DISABLE_NOTES_TRANSLATION_TABLE = [];
for (var i=0; i < 128; i++) {
  DISABLE_NOTES_TRANSLATION_TABLE[i] = -1;
}

//------------------------------------ Init -----------------------------------//
function indexedFunction(index, f) {
  return function(value) {
    f(index, value);
  }
}

var ledControlPort = host.getMidiOutPort(0);
function setLedStatus(onOff, keyNumber, brightness) {
  var status = onOff ? 0x90 : 0x80;
  ledControlPort.sendMidi(status, keyNumber, brightness);
}

function init()
{
	//-------- Set MIDI callbacks / port
	host.getMidiInPort(0).setMidiCallback(onMidiPort1);
	host.getMidiInPort(1).setMidiCallback(onMidiPort2);
	host.getMidiInPort(2).setMidiCallback(onMidiPort3);
	host.getMidiInPort(0).setSysexCallback(onSysexPort1);
	host.getMidiInPort(1).setSysexCallback(onSysexPort2);
	host.getMidiInPort(2).setSysexCallback(onSysexPort3);


	//-------- Note Inputs (see REF below for argument details
	noteIn = host.getMidiInPort(0).createNoteInput("QuNexus Port 1");
	noteIn.setShouldConsumeEvents(false);
  noteIn.setKeyTranslationTable(DISABLE_NOTES_TRANSLATION_TABLE);  // Setting this totally disables note pass-through to the audio engine.

	noteIn2 = host.getMidiInPort(1).createNoteInput("QuNexus Port 2", "80????", "90????");
	noteIn3 = host.getMidiInPort(2).createNoteInput("QuNexus Port 3", "80????", "90????");

	 userControls = host.createUserControlsSection(HIGHEST_CC - LOWEST_CC + 1);

   for(var i=LOWEST_CC; i<=HIGHEST_CC; i++)
   {
      userControls.getControl(i - LOWEST_CC).setLabel("CC" + i);
   }

	//-------- Initialize bitwig interfaces
	//application = host.createApplication();
	//arranger = host.createArranger(0);
	//mixer = host.createMixer("perspective?",0);
	transport = host.createTransport();
	println("This is the QuNexus Script")

  trackBank = host.createMainTrackBank(WHITE_KEY_VALUES.length, 1, 6);

  // Track all the launcher clips tha thave content in them.
  for (var trackIdx=0; trackIdx<WHITE_KEY_VALUES.length; trackIdx++){
    var track = trackBank.getTrack(trackIdx);
    var slotBank = track.clipLauncherSlotBank();
    launcherClips[trackIdx] = [];
    slotBank.addHasContentObserver(
      (function(trackIdx){
        return function (slotIdx, hasContent) {
          if (hasContent) {
            println("Track "+trackIdx+" Slot "+slotIdx+" has content.");
            launcherClips[trackIdx].push(slotIdx);
          } else {
            var activeClips = launcherClips[trackIdx];
            if (activeClips.indexOf(slotIdx) >= 0){
              launcherClips[trackIdx] = activeClips.filter(function(x){ return x != slotIdx});
            }
          }
          println(launcherClips[trackIdx]);
        }
      })(trackIdx)
    );

    clipsPlaying.push([]);
    slotBank.addIsPlayingObserver(
      (function(trackIdx){
        return function (slotIdx, isPlaying) {
          clipsPlaying[trackIdx][slotIdx] = isPlaying;

          var keyNumber = WHITE_KEY_VALUES[trackIdx];
          var brightness = 0x40;
          setLedStatus(isPlaying, keyNumber, brightness);
        }
      })(trackIdx)
    );

  }

}

//--------------------------- MIDI Callbacks / Port ---------------------------//
function onMidiPort1(status, data1, data2)
{
  //println("Port 1 [status, data1, data2]: " + status + ", " + data1 + ", " + data2);
  //println(data1 + ' ' + data2);


  if (status == 144 && data2 != 0) {
    // ch1 note on.
    println("note" + data1 + " " + data2);
    var note = data1;
    var velocity = data2;
    if (WHITE_KEY_VALUES.indexOf(note) >= 0) {
      var idx = WHITE_KEY_VALUES.indexOf(note);
      println("Fetching track "+idx);
      var track = trackBank.getChannel(idx);
      if (track != null) {
        track.playNote(note, velocity);
      }
    } else if (BLACK_KEY_VALUES.indexOf(note) >= 0) {
      println("Black Key: "+note);
      if (note == 70) {
        // "play" Key
        playSomething();
      } else if (note == 68) {
        stopAllClips();
      }
    }
  }




	if(status == 233)
	{
		println("pitchBend" + " " + data1 + " " + data2)

	}else if(status == 153){

		println("Notes"  + " " + data1 + " " + data2)

	}else if (status == 185){

		println("CC"  + " " + data1 + " " + data2)
		sendMidi(status, data1, data2)
	}


   if (isChannelController(status))
   {
      if (data1 >= LOWEST_CC && data1 <= HIGHEST_CC)
      {
         var index = data1 - LOWEST_CC;
         userControls.getControl(index).set(data2, 128);
      }
   }


}

function onMidiPort2(status, data1, data2)
{
	println("Port 2 [status, data1, data2]: " + status + ", " + data1 + ", " + data2);
}

function onMidiPort3(status, data1, data2)
{
	println("Port 3 [status, data1, data2]: " + status + ", " + data1 + ", " + data2);
}

function onSysexPort1(data)
{
	println("Port 1 [sysex data]: " + data);
}

function onSysexPort2(data)
{
	println("Port 2 [sysex data]: " + data);
}

function onSysexPort3(data)
{
	println("Port 3 [sysex data]: " + data);
}

function exit()
{
	println("exit.");
}

//-----Application Code------//

function playSomething() {
  for(var i=0; i<WHITE_KEY_VALUES.length; i++) {
    playRandomClipOrStop(i);
  }
}

function isTrackPlaying(trackIdx){
  // Return true if any of the clips we're tracking in clipsPlaying are marked as playing.
  var trackClips = clipsPlaying[trackIdx];
  return trackClips.some(function(x){ return x === true });
}

function playRandomClip(trackIdx) {
  var availableClips = launcherClips[trackIdx];
  if (availableClips.length > 0) {
    var track = trackBank.getChannel(trackIdx);
    var slots = track.clipLauncherSlotBank();
    var randomClipIdx = availableClips[Math.floor(Math.random()*availableClips.length)];
    println("Play track "+trackIdx+" clip "+randomClipIdx);
    slots.launch(randomClipIdx);
  }
}

function stopTrack(trackIdx) {
  var track = trackBank.getChannel(trackIdx);
  track.stop();
}

function playRandomClipOrStop(trackIdx) {
    var availableClips = launcherClips[trackIdx];
    if ( isTrackPlaying(trackIdx) && Math.random() < 0.25) {
      println("Stopping track "+trackIdx);
      stopTrack(trackIdx);
    } else if (availableClips.length > 0 && Math.random() < CLIP_LAUNCH_PROBABILITY) {
      playRandomClip(trackIdx);
    }
}

function stopAllClips(){
  println("Stop All Clips");
  trackBank.getClipLauncherScenes().stop();
  transport.stop();
}

//--------------------------------- Interfaces --------------------------------//





/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////// REF ////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//--------------------- Note Input Filters

// These filters args are used in the createNoteInput method/function for a midi input port [ see init() ].

// See http://www.midi.org/techspecs/midimessages.php for midi message types.

// Studying up on hexadecimal could be helpful also if it's new to you.


//---- Note Off
// "80????" - Sees all note offs on channel 1
// "8?????" - Sees all note offs on any channel

//---- Note On
// "90????" - Sees all note ons on channel 1
// "9?????" - Sees all note offs on any channel
// "90607F" - Sees all note number 60s with a velocity of 127 (this is a very specific filter)

//---- Polyphonic Aftertouch
// "A0????" - Sees all note ons on channel 1
// "A?????" - Sees all note offs on any channel

//---- Controller Messages
// "B0????" - Sees all cc messages on channel 1
// "B?????" - Sees all cc messages on all channels

//---- Program Changes
// "C0????" - Sees all pgm changes on channel 1
// "C?????" - Sees all pgm changes on all channels

//---- Channel Aftertouch
// "D0????" - Sees all ch. aftertouch on channel 1
// "D?????" - Sees all ch. aftertouch on all channels

//---- Pitch Wheel
// "E0????" - Sees all ch. aftertouch on channel 1
// "E?????" - Sees all ch. aftertouch on all channels
// "E???00" - Sees all ch. aftertouch on all channels with an MSB of zero
// "E?00??" - Sees all ch. aftertouch on all channels with an LSB of zero

//---- SysEx start/end, esoteric MIDI mysticism (wouldn't use these filters unless your traversing some kind of musical 3-byte worm hole)
//---- For sysex, just use the callbacks defined above
// "F0????" - Sees all ch. aftertouch on channel 1
// "D?????" - Sees all ch. aftertouch on all channels
