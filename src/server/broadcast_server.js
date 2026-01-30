// @ts-check
//
//  Created by Chen Mingliang on 23/11/30.
//  illuspas@msn.com
//  Copyright (c) 2023 NodeMedia. All rights reserved.
//

const crypto = require("node:crypto");
const Flv = require("../protocol/flv.js");
const Rtmp = require("../protocol/rtmp.js");
const AVPacket = require("../core/avpacket.js");
const BaseSession = require("../session/base_session.js");
const Context = require("../core/context.js");
const logger = require("../core/logger.js");
const { decodeAmf0Data } = require("../protocol/amf.js");

class BroadcastServer {
	constructor() {
		/** @type {BaseSession | null} */
		this.publisher = null;

		/** @type {Map<string, BaseSession>} */
		this.subscribers = new Map();

		/** @type {Buffer} */
		this.flvHeader = Flv.createHeader(true, true);

		/** @type {Buffer | null} */
		this.flvMetaData = null;

		/** @type {Buffer | null} */
		this.flvAudioHeader = null;

		/** @type {Buffer | null} */
		this.flvVideoHeader = null;

		/** @type {Buffer | null} */
		this.rtmpMetaData = null;

		/** @type {Buffer | null} */
		this.rtmpAudioHeader = null;

		/** @type {Buffer | null} */
		this.rtmpVideoHeader = null;

		/**@type {Set<Buffer> | null} */
		this.flvGopCache = null;

		/**@type {Set<Buffer> | null} */
		this.rtmpGopCache = null;
	}

	/**
	 *
	 * @param {string} authKey
	 * @param {BaseSession} session
	 * @returns {boolean}
	 */
	verifyAuth = (authKey, session) => {
		if (authKey === "") {
			return true;
		}
		const signStr = session.streamQuery?.sign;
		if (signStr?.split("-")?.length !== 2) {
			return false;
		}
		const now = (Date.now() / 1000) | 0;
		const exp = parseInt(signStr.split("-")[0]);
		const shv = signStr.split("-")[1];
		const str = session.streamPath + "-" + exp + "-" + authKey;
		if (exp < now) {
			return false;
		}
		const md5 = crypto.createHash("md5");
		const ohv = md5.update(str).digest("hex");
		return shv === ohv;
	};

	/**
	 * @param {BaseSession} session
	 * @returns {string | null}
	 */
	postPlay = (session) => {
		if (session.ip !== "") {
			Context.eventEmitter.emit("prePlay", session);
		}

		if (Context.config.auth?.play && session.ip !== "") {
			if (!this.verifyAuth(Context.config.auth?.secret, session)) {
				return `play stream ${session.streamPath} authentication verification failed`;
			}
		}
		if (session.ip !== "") {
			Context.eventEmitter.emit("postPlay", session);
		}
		switch (session.protocol) {
			case "flv":
				session.sendBuffer(this.flvHeader);
				if (this.flvMetaData !== null) {
					session.sendBuffer(this.flvMetaData);
				}
				if (this.flvAudioHeader !== null) {
					session.sendBuffer(this.flvAudioHeader);
				}
				if (this.flvVideoHeader !== null) {
					session.sendBuffer(this.flvVideoHeader);
				}
				if (this.flvGopCache !== null) {
					this.flvGopCache.forEach((v) => {
						session.sendBuffer(v);
					});
				}
				break;
			case "rtmp":
				if (this.rtmpMetaData != null) {
					session.sendBuffer(this.rtmpMetaData);
				}
				if (this.rtmpAudioHeader != null) {
					session.sendBuffer(this.rtmpAudioHeader);
				}
				if (this.rtmpVideoHeader != null) {
					session.sendBuffer(this.rtmpVideoHeader);
				}
				if (this.rtmpGopCache !== null) {
					this.rtmpGopCache.forEach((v) => {
						session.sendBuffer(v);
					});
				}
		}

		this.subscribers.set(session.id, session);
		return null;
	};

	/**
	 * @param {BaseSession} session
	 */
	donePlay = (session) => {
		session.endTime = Date.now();
		if (session.ip !== "") {
			Context.eventEmitter.emit("donePlay", session);
		}
		this.subscribers.delete(session.id);
	};

	/**
	 * @param {BaseSession} session
	 * @returns {string | null}
	 */
	postPublish = (session) => {
		Context.eventEmitter.emit("prePublish", session);

		if (Context.config.auth?.publish) {
			if (!this.verifyAuth(Context.config.auth?.secret, session)) {
				return `publish stream ${session.streamPath} authentication verification failed`;
			}
		}

		Context.eventEmitter.emit("postPublish", session);
		if (this.publisher == null) {
			this.publisher = session;
		} else {
			return `streamPath=${session.streamPath} already has a publisher`;
		}
		return null;
	};

	/**
	 * @param {BaseSession} session
	 */
	donePublish = (session) => {
		if (session === this.publisher) {
			session.endTime = Date.now();
			Context.eventEmitter.emit("donePublish", session);
			this.publisher = null;
			this.flvMetaData = null;
			this.flvAudioHeader = null;
			this.flvVideoHeader = null;
			this.rtmpMetaData = null;
			this.rtmpAudioHeader = null;
			this.rtmpVideoHeader = null;
			this.flvGopCache?.clear();
			this.rtmpGopCache?.clear();
		}
	};

	/**
	 * @param {AVPacket} packet
	 */
	broadcastMessage = (packet) => {
		if (packet.flags == 5) {
			const metadata = decodeAmf0Data(packet.data);
			if (
				this.publisher &&
				metadata.cmd === "@setDataFrame" &&
				metadata.dataObj !== null
			) {
				this.publisher.audioCodec = metadata.dataObj.audiocodecid;
				this.publisher.audioChannels = metadata.dataObj.stereo ? 2 : 1;
				this.publisher.audioSamplerate = metadata.dataObj.audiosamplerate;
				this.publisher.audioDatarate = metadata.dataObj.audiodatarate;
				this.publisher.videoCodec = metadata.dataObj.videocodecid;
				this.publisher.videoWidth = metadata.dataObj.width;
				this.publisher.videoHeight = metadata.dataObj.height;
				this.publisher.videoFramerate = metadata.dataObj.framerate;
				this.publisher.videoDatarate = metadata.dataObj.videodatarate;
				// Capture stream metadata (title with fallback to stream name)
				this.publisher.streamTitle =
					metadata.dataObj.title || this.publisher.streamName;
				this.publisher.streamDescription = metadata.dataObj.description || "";
				this.publisher.encoder = metadata.dataObj.encoder || "";
				this.publisher.metadata = metadata.dataObj;
			}
		}
		const flvMessage = Flv.createMessage(packet);
		const rtmpMessage = Rtmp.createMessage(packet);
		switch (packet.flags) {
			case 0:
				this.flvAudioHeader = Buffer.from(flvMessage);
				this.rtmpAudioHeader = Buffer.from(rtmpMessage);
				break;
			case 1:
				this.flvGopCache?.add(flvMessage);
				this.rtmpGopCache?.add(rtmpMessage);
				break;
			case 2:
				this.flvVideoHeader = Buffer.from(flvMessage);
				this.rtmpVideoHeader = Buffer.from(rtmpMessage);
				break;
			case 3:
				this.flvGopCache?.clear();
				this.rtmpGopCache?.clear();
				this.flvGopCache = new Set();
				this.rtmpGopCache = new Set();
				this.flvGopCache.add(flvMessage);
				this.rtmpGopCache.add(rtmpMessage);
				break;
			case 4:
				this.flvGopCache?.add(flvMessage);
				this.rtmpGopCache?.add(rtmpMessage);
				break;
			case 5:
				this.flvMetaData = Buffer.from(flvMessage);
				this.rtmpMetaData = Buffer.from(rtmpMessage);
				break;
		}
		if (this.flvGopCache && this.flvGopCache.size > 4096) {
			this.flvGopCache.clear();
		}
		if (this.rtmpGopCache && this.rtmpGopCache.size > 4096) {
			this.rtmpGopCache.clear();
		}
		this.subscribers.forEach((v, k) => {
			switch (v.protocol) {
				case "flv":
					v.sendBuffer(flvMessage);
					break;
				case "rtmp":
					v.sendBuffer(rtmpMessage);
			}
		});
	};
}

module.exports = BroadcastServer;
