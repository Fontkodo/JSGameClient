# JSGameClient
This is the JavaScript web client for Blasteroids

## How It Works

The client performs two main functions:

1) Renders the visual interpretation of the game state
2) Transmits user input to the server

Every time the game state is received from the server, it goes through the collection of Space Object and draws them according to their internal specifications, i.e. what image to use, current location, velocity, rotational velocity, etc.

The client also keeps track of the ID of the player it is supposed to be controlling. It uses this not only to send user input to the server, but also to render player stats, i.e. score, photon count, fuel, shield level, and high score.
