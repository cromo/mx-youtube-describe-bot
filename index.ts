import { readFileSync } from "fs";
import * as TOML from "@iarna/toml";
import * as R from "ramda";
import { MatrixClient, AutojoinRoomsMixin, SimpleFsStorageProvider } from "matrix-bot-sdk";

interface Config {
    homeserverUrl: string;
    accessToken: string;
    syncStateFile: string;
}

const readUtf8File = R.curryN(2, readFileSync)(R.__, {encoding: "utf-8"});
const readConfig = R.pipe(readUtf8File, TOML.parse);
const envConfig = R.concat("MX_YT_DESCRIBE_BOT_");
const envConfigFor = R.compose(R.flip(R.prop)(process.env), envConfig);
const getClient = R.pipe(R.constructN(3, MatrixClient), R.tap(AutojoinRoomsMixin.setupOnClient));

const hasContent = R.compose(R.not, R.isNil, R.prop("content"));
const eventBody = R.path(["content", "body"]);
const eventType = R.path(["content", "msgtype"]);
const isTextMessage = R.pipe(eventType, R.equals("m.text"));
const youTubeLink = R.pipe(eventBody, R.tap(console.log), R.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/), R.tap(console.log));
const hasYouTubeLink = R.pipe(youTubeLink, R.length, R.tap(console.log), R.lt(0), R.tap(console.log));
//https://www.youtube.com/watch?v=TeG4XHxb6BU
const shouldRespond = R.allPass([hasContent, isTextMessage, hasYouTubeLink]);
const sendNotice = R.curry((client, roomId, message) => client.sendNotice(roomId, message));

const config = readConfig("config.toml") as unknown as Config;
const client = getClient(config.homeserverUrl, config.accessToken, new SimpleFsStorageProvider(config.syncStateFile));

client.start().then(() => console.log("mx-youtube-describe-bot connected"));
client.on("room.message", (roomId, event) => {
    const notifyRoom = sendNotice(client, roomId);
    R.when(
        shouldRespond,
        R.pipe(
            eventBody,
            notifyRoom
        ),
        event
    );
});