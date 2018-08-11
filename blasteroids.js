

function blasteroids(config){ //{ userid:, wsUri:.., canvas: ... }

    var wsUri	  = config.wsUri; //"ws://10.0.0.169:6080/blasteroids";
    var canvas	  = config.canvas;
    var userid	  = config.userid; // "Fontkodo"
    var waitReady = config.waitReady;

    var websocket		= null;
    var gameState		= null;
    var displayCount		= 0;
    var messageCount		= 0;
    var millisecondAdjustment	= 0;
    var previousAudio           = null;

    if(!userid){
	throw("no user id supplied");
    }
    if(userid.match(/"/)){
	throw("bad user id supplied");
    }
    if(!(wsUri && wsUri.match(/^wss?:.*/))){
	throw("bad wsURI " + wsURI);
    }

    function sendUserAction(action){
	doSend('{ "userid" : "' + userid + '", "action" : "' + action + '"}');
    }

    function init()
    {
	websocket		= new WebSocket(wsUri);
	websocket.onopen	= onOpen; 
	websocket.onmessage	= onMessage; 
	websocket.onerror	= onError;
    }

    function onOpen(evt)
    {
	sendUserAction("connect");
	setInterval(display,35);
    }

    function setMillisecondAdjustment(remoteMillis){
	var diff = (new Date()).getTime() - remoteMillis;
	if(!millisecondAdjustment){
	    millisecondAdjustment = diff;
	} else {
	    millisecondAdjustment = ((19 * millisecondAdjustment) + diff) / 20;
	}
    }

    var fetchImg = function(){
	cache = {};
	return function(imgName){
	    var img = cache[imgName];
	    if(!img){
		img = new Image()
		img.src = imgName;
		cache[imgName] = img;
	    }
	    return img;
	};
    }();

    var fetchSound = function(){
	cache = {};
	return function(name){
	    var sound = cache[name];
	    if(!sound){
		sound = new Howl({ src: [name]});
		cache[name] = sound;
	    }
	    return sound;
	};
    }();

    function display(){

	if(!gameState){
	    return
	}

	var currentMillis = (new Date()).getTime();
	var ctx = canvas.getContext("2d");

	ctx.fillStyle = "black";
	ctx.fillRect(0,0,1400,800);

	if(gameState.Sounds){
	    var sounds = gameState.Sounds;
	    for(i=0; i<sounds.length; i++){
		if(previousAudio){
		    previousAudio.stop();
		    previousAudio.currentTime = 0;
		}
		previousAudio = fetchSound(sounds[i]);
		previousAudio.play();
		break;
	    }
	}

	if(gameState.SpaceObjects){
	    var sos = gameState.SpaceObjects
	    for(i=0; i<sos.length; i++){
		var so = sos[i];
		var loc = so.loc;
		var vel = so.vel;
		var elapsed = currentMillis - so.timestamp + millisecondAdjustment;
		var x = loc.x + (elapsed * vel.x);
		var y = loc.y + (elapsed * vel.y);
		var radians = -((elapsed * so.rotvel) + so.currentRotation);
		var img = fetchImg(so.imgURL);
		var scale = so.scale;
		ctx.save();
		ctx.translate(x,y);
		ctx.rotate(radians);
		ctx.scale(scale,scale);
		if(so.userid == userid){
		    ctx.strokeStyle = "yellow";
		    ctx.beginPath();
		    ctx.lineWidth = 2;
		    ctx.arc(0,0,5+ img.height/2,0,2*Math.PI);
		    ctx.stroke();
		}
		ctx.drawImage(img,-img.width/2, -img.height/2);
		ctx.restore();
	    }
	}

	var player = null;
	if(gameState.SpaceObjects){
	    var sos = gameState.SpaceObjects;
	    for(i=0; i<sos.length; i++){
		var so = sos[i];
		if(so.userid == userid){
		    player = so;
		    break;
		}
	    }
	}

	if(gameState.SpaceObjects){
	    var sos = gameState.SpaceObjects;
	    var msg = "";
	    for(i=0; i<sos.length; i++){
		var so = sos[i];
		if(so.score){
		    msg = msg + (so.userid + ":" + so.score + "/" + so.highScore + "    ");
		}
	    }
	    ctx.fillStyle = "white";
	    ctx.font = "14px Arial";
	    ctx.fillText(msg, 10, 780);
	}

	if(player){
	    ctx.fillStyle = "white";
	    ctx.font = "14px Arial";
	    var stats = [ { label: 'Score', value : player.score },
			  { label: 'Photons', value: player.photonCount },
			  { label: 'Fuel',  value: player.fuel.toFixed(1) },
			  { label: 'Shield Level', value: player.shieldLevel },
			  { label: 'High Score', value: player.highScore }];

	    for(i=0; i<stats.length; i++){
		var label = stats[i].label + ":";
		var value = "" + stats[i].value;
		var measure = ctx.measureText(label);
		var width = measure.width;
		var y = 15 * (i+1);
		ctx.fillText(label, 120 - width, y);
		ctx.fillText(value, 125, y);
	    }
	} else {
	    var msg = "Player Deceased"
            ctx.font = "42px Arial";
            ctx.fillStyle = "yellow";
            var width = ctx.measureText(msg).width;
            ctx.fillText(msg, 700 - (width/2), 380);
	    setTimeout(function(){ document.location="/"; },3000);
	}
    }

    var netStringCollector = "";

    function onMessage(evt)
    {
	if (!evt.data){
	    return
	}

	netStringCollector = netStringCollector + evt.data;

	// If it does not match netstring, try to find beginning of next
	// netstring.
	if (!netStringCollector.match(/^[0-9]+:/)){
	    console.log("unexpected input: " + netStringCollector.substr(0,30) + "...")
	    netStringCollector = netStringCollector.replace(/^.*,([0-9]+:.*)/,'\$1');
	    console.log("skipping");
	    return
	}

	while (netStringCollector.length > 0){
	    
	    var size = parseInt(netStringCollector);
	    var requiredSize = (size + "").length + size + (":,".length)
	    if (requiredSize > netStringCollector.length){
		break;
	    }

	    // Perhaps more than the required amount arrived in multiple netstrings.
	    // Evaluate the first netstring and keep the remainder in netStringCollector.
	    var currentNetString = netStringCollector.substr(0,requiredSize);
	    var content = currentNetString.replace(/^[0-9]+:(.*),/, '\$1');
	    netStringCollector = netStringCollector.substr(requiredSize);

	    messageCount++;
	    gameState = JSON.parse(content);

	    if(gameState.currentMillis){
		setMillisecondAdjustment(gameState.currentMillis);
	    }
	    
	    display();
	}
    }

    function onError(evt)
    {
	alert("WEBSOCKET ERROR " + (evt.data || ""));
    }

    function netstring(txt){
	return txt.length + ":" + txt + ",";
    }

    function doSend(message)
    {
	if(websocket){
	    websocket.send(netstring(message));
	} else {
	    console.log("no websocket");
	}
    }

    function setupScaling(){

	var w = Math.max(
	    document.body.scrollWidth,
	    document.documentElement.scrollWidth,
	    document.body.offsetWidth,
	    document.documentElement.offsetWidth,
	    document.documentElement.clientWidth);

	var h = Math.max(
	    document.body.scrollHeight,
	    document.documentElement.scrollHeight,
	    document.body.offsetHeight,
	    document.documentElement.offsetHeight,
	    document.documentElement.clientHeight);

	var scaling = Math.min((w-20) / 1400, (h-20) / 800)

	canvas.width = scaling * 1400;
	canvas.height = scaling * 800;

	var ctx = canvas.getContext("2d");
	ctx.scale(scaling, scaling);

    }

    if(waitReady){
	window.addEventListener("load", init, false);
	document.addEventListener('DOMContentLoaded',setupScaling);
    } else {
	init();
	setupScaling();
    }

    document.addEventListener("keydown", function(e){
	var commands = { Space: "fire",
			 ArrowRight: "right",
			 ArrowLeft: "left",
			 ArrowUp: "forward",
			 ArrowDown: "backward" };
	var action = commands[e.code];
	if (action) {
	    sendUserAction(action);
	    e.preventDefault();
	}
    });

}
