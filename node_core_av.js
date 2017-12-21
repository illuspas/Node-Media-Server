const Bitop = require('bitop');
const AAC_SAMPLE_RATE = [
    96000, 88200, 64000, 48000,
    44100, 32000, 24000, 22050,
    16000, 12000, 11025, 8000,
    7350, 0, 0, 0
];

const AAC_CHANNELS = [
    0, 1, 2, 3, 4, 5, 6, 8
];

const AUDIO_CODEC_NAME = [
    '',
    'ADPCM',
    "MP3",
    "LinearLE",
    "Nellymoser16",
    "Nellymoser8",
    "Nellymoser",
    "G711A",
    "G711U",
    "",
    "AAC",
    "Speex",
    "",
    "",
    "MP3-8K",
    "DeviceSpecific",
    "Uncompressed"
];

const AUDIO_SOUND_RATE = [
    5512, 11025, 22050, 44100
];

const VIDEO_CODEC_NAME = [
    "",
    "Jpeg",
    "Sorenson-H263",
    "ScreenVideo",
    "On2-VP6",
    "On2-VP6-Alpha",
    "ScreenVideo2",
    "H264",
    "",
    "",
    "",
    "",
    "H265"
];

function getObjectType(bitop) {
    let audioObjectType = bitop.read(5);
    if (audioObjectType === 31) {
        audioObjectType = bitop.read(6) + 32;
    }
    return audioObjectType;
}

function getSampleRate(bitop, info) {
    info.sampling_index = bitop.read(4);
    return info.sampling_index == 0x0f ? bitop.read(24) : AAC_SAMPLE_RATE[info.sampling_index];
}

function readAudioSpecificConfig(aacSequenceHeader) {
    let info = {};
    let bitop = new Bitop(aacSequenceHeader);
    bitop.read(16);
    info.object_type = getObjectType(bitop);
    info.sample_rate = getSampleRate(bitop, info);
    info.chan_config = bitop.read(4);
    if (info.chan_config < AAC_CHANNELS.length) {
        info.channels = AAC_CHANNELS[info.chan_config];
    }
    info.sbr = -1;
    info.ps = -1;
    if (info.object_type == 5 || info.object_type == 29) {
        if (info.object_type == 29) {
            info.ps = 1;
        }
        info.ext_object_type = 5;
        info.sbr = 1;
        info.sample_rate = getSampleRate(bitop, info);
        info.object_type = getObjectType(bitop);
    }

    return info;
}

function getAACProfileName(info) {
    switch (info.object_type) {
        case 1:
            return "Main";
        case 2:
            if (info.ps > 0) {
                return "HEv2";
            }
            if (info.sbr > 0) {
                return "HE";
            }
            return "LC";
        case 3:
            return "SSR";
        case 4:
            return "LTP";
        case 5:
            return "SBR";
        default:
            return "";
    }
}

module.exports = {
    AUDIO_SOUND_RATE,
    AUDIO_CODEC_NAME,
    VIDEO_CODEC_NAME,
    readAudioSpecificConfig,
    getAACProfileName
};