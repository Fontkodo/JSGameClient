

function launch(){
    var userid = prompt("Player ID");
    if(!userid){
	return;
    }
    document.body.classList.add('dark-background');
    document.getElementById("main").style.display = 'none';
    blasteroids({
	userid: userid,
	wsUri: "ws://" + document.location.hostname + ":6080/blasteroids",
	waitReady : false,
	canvas: document.getElementById("canvas") });
}


function blasteroids(config){ //{ userid:, wsUri:.., canvas: ... }
    
    "use strict";

    var wsUri	  = config.wsUri; //"ws://10.0.0.169:6080/blasteroids";
    var canvas	  = config.canvas;
    var userid	  = config.userid; // "Fontkodo"
    var waitReady = config.waitReady;

    var websocket		= null;
    var gameState		= null;
    var messageCount		= 0;
    var millisecondAdjustment	= 0;
    var messageText             = "Up/Down Arrows for thrust, Right/Left to turn, SPACE to fire, S toggle Sound";
    var soundEnabled            = true;
    var lastDisplayTime         = 0;

    if(!userid){
	throw("no user id supplied");
    }
    if(userid.match(/"/)){
	throw("bad user id supplied");
    }
    if(!(wsUri && wsUri.match(/^wss?:.*/))){
	throw("bad wsUri " + wsUri);
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
	//setInterval(display,35);
	displayTimeoutCallback();
    }

    function setMillisecondAdjustment(remoteMillis){
	var diff = (new Date()).getTime() - remoteMillis;
	if(!millisecondAdjustment){
	    millisecondAdjustment = diff;
	} else {
	    millisecondAdjustment = ((4 * millisecondAdjustment) + diff) / 5;
	}
    }

    var fetchImg = function(){
	var cache = {};
	return function(imgName){
	    var img = cache[imgName];
	    if(!img){
		img = new Image();
		img.src = imgName;
		cache[imgName] = img;
	    }
	    return img;
	};
    }();

    var playSound = function(){
	var cache = {};
	return function(name){
	    if(!soundEnabled){
		return;
	    }
	    name = name.replace(/.wav$/,'.mp3');
	    var sound = cache[name];
	    if(!sound){
		sound = new Audio(name);
		cache[name] = sound;
	    }
	    setTimeout(function(){
		sound.currentTime = 0;
		sound.play();
	    },1);
	};
    }();

    function displayTimeoutCallback(){
	display();
	setTimeout(displayTimeoutCallback,35);
    }

    function display(){

	var currentMillis = (new Date()).getTime();
	var ctx = canvas.getContext("2d");

	if(!gameState || !gameState.SpaceObjects){
	    return;
	}

	if(currentMillis - lastDisplayTime < 20){
	    return;
	}
	lastDisplayTime = currentMillis;

	ctx.fillStyle = "black";
	ctx.fillRect(0,0,1400,800);

	// Play only the first requested sound
	if(gameState.Sounds && gameState.Sounds.length){
	    playSound(gameState.Sounds[0]);
	}

        gameState.SpaceObjects.forEach( so => {
            const loc = so.loc;
            const vel = so.vel;
            const elapsed = currentMillis - so.timestamp - millisecondAdjustment;
            const x = loc.x + (elapsed * vel.x);
            const y = loc.y + (elapsed * vel.y);
            const radians = -((elapsed * so.rotvel) + so.currentRotation);
            const img = fetchImg(so.imgURL);
            const scale = so.scale;
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
        });

        var player = gameState.SpaceObjects.find(so => so.userid == userid);

        var msg = (gameState.SpaceObjects.filter(so => so.score)
                    .map(so => `${so.userid}:${so.score}/${so.highScore}`)
                    .join("   "));

        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.fillText(msg, 10, 780);

	if(player){
	    ctx.fillStyle = "white";
	    ctx.font = "14px Arial";
	    const stats = [ { label: 'Score', value : player.score },
		      { label: 'Photons', value: player.photonCount },
		      { label: 'Fuel',  value: player.fuel.toFixed(1) },
		      { label: 'Shield Level', value: player.shieldLevel },
		      { label: 'High Score', value: player.highScore }];
            stats.forEach((stat,i) => {
		const label = stats[i].label + ":";
		const value = "" + stats[i].value;
		const measure = ctx.measureText(label);
		const width = measure.width;
		const y = 15 * (i+1);
		ctx.fillText(label, 120 - width, y);
		ctx.fillText(value, 125, y);
	    });
	} else {
	    messageText = "Player Deceased";
            ctx.font = "42px Arial";
            ctx.fillStyle = "yellow";
            const width = ctx.measureText(msg).width;
            ctx.fillText(msg, 700 - (width/2), 380);
	    setTimeout(function(){ document.location=document.location; },3000);
	}
	
	if(messageText) {
	    ctx.fillStyle = "yellow";
	    ctx.font = "24px Arial";
	    ctx.fillText(messageText, 700-ctx.measureText(messageText).width/2, 50);
	}

    }

    var netStringCollector = "";

    function onMessage(evt)
    {
	if (!evt.data){
	    return;
	}

	netStringCollector = netStringCollector + evt.data;

	// If it does not match netstring, try to find beginning of next
	// netstring.
	if (!netStringCollector.match(/^[0-9]+:/)){
	    console.log("unexpected input: " + netStringCollector.substr(0,30) + "...");
	    netStringCollector = netStringCollector.replace(/^.*,([0-9]+:.*)/,'\$1');
	    console.log("skipping");
	    return;
	}

	while (netStringCollector.length > 0){
	    
	    var size = parseInt(netStringCollector);
	    var requiredSize = (size + "").length + size + (":,".length);
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

	var scaling = Math.min((w-20) / 1400, (h-20) / 800);

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
 	var commands = { Space		: "fire",
			 " "		: "fire",
			 ArrowRight	: "right",
			 ArrowLeft	: "left",
			 ArrowUp	: "forward",
			 ArrowDown	: "backward" };
	// Mac uses e.code, Win10 uses e.key
	var action = commands[e.code || e.key];
	if (action) {
	    sendUserAction(action);
	    e.preventDefault();
	}
	messageText = '';
	if(e.code == "KeyS"){
	    soundEnabled = !soundEnabled;
	    messageText = soundEnabled ? "Sound Enabled" : "Sound Disabled";
	}
    });

}

