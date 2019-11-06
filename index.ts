import { readFileSync } from "fs";
import * as TOML from "@iarna/toml";
import * as R from "ramda";
import * as fetch from "node-fetch";
import { MatrixClient, AutojoinRoomsMixin, SimpleFsStorageProvider } from "matrix-bot-sdk";

interface Config {
    homeserverUrl: string;
    accessToken: string;
    syncStateFile: string;
    youTubeApiKey: string;
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
const youTubeLink = R.pipe(eventBody, R.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/));
const hasYouTubeLink = R.pipe(youTubeLink, R.length, R.lt(0));
const shouldRespond = R.allPass([hasContent, isTextMessage, hasYouTubeLink]);
const sendNotice = R.curry((client, roomId, message) => client.sendNotice(roomId, message));

const youTubeVideo = R.curry((apiKey, videoId) => fetch(`https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails&fields=items(id,snippet/title,contentDetails/duration)`).then(res => res.json()));


const config = readConfig("config.toml") as unknown as Config;
const client = getClient(config.homeserverUrl, config.accessToken, new SimpleFsStorageProvider(config.syncStateFile));
const video = youTubeVideo(config.youTubeApiKey);

client.start().then(() => console.log("mx-youtube-describe-bot connected"));
client.on("room.message", async (roomId, event) => {
    if (!shouldRespond(event)) {
        return;
    }
    const notifyRoom = sendNotice(client, roomId);
    const videoInfo = await R.pipe(
        youTubeLink,
        R.path([1]),
        video,
    )(event);
    R.pipe(
        R.path(["items", 0]),
        R.toString,
        notifyRoom
    )(videoInfo);
});