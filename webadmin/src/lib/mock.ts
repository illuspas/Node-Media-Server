import { rndInt } from "./format";

export interface Stream {
  app: string;
  name: string;
  title: string;
  ip: string;
  proto: string;
  bitrate: number;
  viewers: number;
  dur: number;
  res: string;
  fps: number;
  codec: string;
  status: "online" | "idle" | "offline";
  /** Toggled by the "record" action on the streams page. */
  rec?: boolean;
}

export interface RelayTask {
  id: string;
  name: string;
  type: "push" | "pull";
  src: string;
  dst: string;
  status: "running" | "stopped";
  time: string;
}

export interface RecTask {
  id: number;
  app: string;
  name: string;
  title: string;
  fmt: string;
  bitrate: number;
  dur: number;
  /** Accumulated size in MB. */
  size: number;
}

export interface RecFile {
  name: string;
  stream: string;
  fmt: string;
  /** Size in GB. */
  size: number;
  dur: string;
  time: string;
}

export const STREAM_STATUS: Record<Stream["status"], { label: string; cls: string }> = {
  online: { label: "推流中", cls: "badge-success" },
  idle: { label: "待推送", cls: "badge-warning" },
  offline: { label: "离线", cls: "badge-neutral" }
};

export const APP_NAMES = ["live", "show", "game", "event", "music", "edu", "vod"] as const;

export const STREAMS: Stream[] = [
  { app: "live", name: "cctv5_hd", title: "欧冠半决赛·足球之夜", ip: "112.85.3.21", proto: "RTMP", bitrate: 4850, viewers: 3216, dur: 7231, res: "1080p", fps: 60, codec: "H.264", status: "online" },
  { app: "game", name: "lol_pro_01", title: "LPL 电竞联赛·总决赛", ip: "119.98.2.44", proto: "RTMP", bitrate: 6200, viewers: 5127, dur: 10822, res: "1080p", fps: 60, codec: "H.264", status: "online" },
  { app: "show", name: "concert_live", title: "新年音乐会现场", ip: "203.156.1.7", proto: "SRT", bitrate: 8500, viewers: 2893, dur: 3644, res: "1080p", fps: 30, codec: "H.265", status: "online" },
  { app: "event", name: "product_launch", title: "科技新品发布会", ip: "116.77.2.3", proto: "RTMP", bitrate: 5100, viewers: 1876, dur: 2712, res: "1080p", fps: 30, codec: "H.264", status: "online" },
  { app: "live", name: "outdoor_camp", title: "户外露营·星空夜话", ip: "223.104.7.88", proto: "RTMP", bitrate: 2600, viewers: 892, dur: 5410, res: "720p", fps: 30, codec: "H.264", status: "online" },
  { app: "game", name: "cs2_rank", title: "CS2 冲分之路", ip: "202.98.6.1", proto: "RTMP", bitrate: 5800, viewers: 1122, dur: 6308, res: "1440p", fps: 60, codec: "H.264", status: "online" },
  { app: "game", name: "mc_24h", title: "24 小时沙盒生存", ip: "182.150.9.12", proto: "RTMP", bitrate: 3800, viewers: 654, dur: 86422, res: "1080p", fps: 60, codec: "H.264", status: "online" },
  { app: "show", name: "talk_show_88", title: "深夜脱口秀", ip: "171.88.4.90", proto: "RTMP", bitrate: 2400, viewers: 445, dur: 4523, res: "720p", fps: 30, codec: "H.264", status: "online" },
  { app: "live", name: "food_tour", title: "美食探店·成都站", ip: "125.34.9.77", proto: "RTMP", bitrate: 2000, viewers: 321, dur: 3344, res: "720p", fps: 30, codec: "H.264", status: "online" },
  { app: "edu", name: "python_class", title: "Python 全栈实战课", ip: "58.34.11.9", proto: "RTMP", bitrate: 1500, viewers: 156, dur: 5402, res: "1080p", fps: 30, codec: "H.264", status: "online" },
  { app: "live", name: "fit_am", title: "清晨燃脂训练营", ip: "117.136.5.4", proto: "RTMP", bitrate: 1800, viewers: 289, dur: 3620, res: "720p", fps: 30, codec: "H.264", status: "online" },
  { app: "music", name: "piano_night", title: "钢琴演奏·夜曲集", ip: "61.144.8.2", proto: "RTSP", bitrate: 2200, viewers: 178, dur: 2744, res: "1080p", fps: 30, codec: "H.264", status: "online" },
  { app: "event", name: "wedding_hall", title: "婚礼现场直播", ip: "113.67.3.55", proto: "RTMP", bitrate: 3100, viewers: 96, dur: 1844, res: "1080p", fps: 25, codec: "H.264", status: "online" },
  { app: "vod", name: "replay_2024", title: "赛事回放轮播频道", ip: "—", proto: "HLS", bitrate: 1200, viewers: 640, dur: 0, res: "1080p", fps: 30, codec: "H.264", status: "idle" },
  { app: "live", name: "test_stress", title: "压测专用流", ip: "192.168.1.24", proto: "RTMP", bitrate: 800, viewers: 2, dur: 912, res: "480p", fps: 30, codec: "H.264", status: "idle" },
  { app: "live", name: "old_channel", title: "旧版测试频道", ip: "—", proto: "RTMP", bitrate: 0, viewers: 0, dur: 0, res: "—", fps: 0, codec: "—", status: "offline" }
];

export const RELAY_TASKS: RelayTask[] = [
  { id: "T-2048", name: "欧冠赛事分发", type: "push", src: "live/cctv5_hd", dst: "rtmp://cdn-edge-01.example.com/live/cctv5_hd", status: "running", time: "20:31" },
  { id: "T-1873", name: "B站直播转推", type: "push", src: "game/lol_pro_01", dst: "rtmp://push.bilivideo.com/live?room=883477", status: "running", time: "19:58" },
  { id: "T-1652", name: "备用源回源拉流", type: "pull", src: "rtmp://origin-backup.example.com/show/concert_live", dst: "show/concert_live", status: "running", time: "18:02" },
  { id: "T-1544", name: "美食探店·抖音", type: "push", src: "live/food_tour", dst: "rtmp://push.douyin.example.com/live/food_88", status: "stopped", time: "昨天 22:41" },
  { id: "T-1391", name: "发布会源拉取", type: "pull", src: "rtmp://source.example.com/event/launch", dst: "event/product_launch", status: "stopped", time: "昨天 09:15" },
  { id: "T-1207", name: "钢琴夜曲分发", type: "push", src: "music/piano_night", dst: "rtmp://cdn-02.example.com/live/piano", status: "running", time: "06-10 14:22" },
  { id: "T-0986", name: "回放归档推流", type: "push", src: "vod/replay_2024", dst: "rtmp://archive.internal:1935/vod/replay", status: "stopped", time: "06-09 11:05" }
];

export const REC_TASKS: RecTask[] = [
  { id: 1, app: "live", name: "cctv5_hd", title: "欧冠半决赛·足球之夜", fmt: "MP4", bitrate: 4850, dur: 5538, size: 3266 },
  { id: 2, app: "game", name: "lol_pro_01", title: "LPL 电竞联赛·总决赛", fmt: "FLV", bitrate: 6200, dur: 10263, size: 7888 },
  { id: 3, app: "show", name: "concert_live", title: "新年音乐会现场", fmt: "MP4", bitrate: 8500, dur: 3524, size: 3722 }
];

export const REC_FILES: RecFile[] = [
  { name: "talk_show_88_0611_230402.mp4", stream: "show/talk_show_88", fmt: "MP4", size: 2.1, dur: "02:41:19", time: "昨天 23:04" },
  { name: "outdoor_camp_0611_190230.flv", stream: "live/outdoor_camp", fmt: "FLV", size: 3.8, dur: "01:30:12", time: "昨天 19:02" },
  { name: "python_class_0611_190001.mp4", stream: "edu/python_class", fmt: "MP4", size: 1.2, dur: "01:29:58", time: "昨天 19:00" },
  { name: "fit_am_0611_070015.mp4", stream: "live/fit_am", fmt: "MP4", size: 0.9, dur: "01:00:03", time: "昨天 07:00" },
  { name: "cs2_rank_0610_211204.flv", stream: "game/cs2_rank", fmt: "FLV", size: 5.6, dur: "02:12:40", time: "06-10 21:12" },
  { name: "piano_night_0610_203011.mp4", stream: "music/piano_night", fmt: "MP4", size: 1.7, dur: "00:45:36", time: "06-10 20:30" },
  { name: "wedding_hall_0610_150908.mp4", stream: "event/wedding_hall", fmt: "MP4", size: 2.9, dur: "01:03:22", time: "06-10 15:09" },
  { name: "mc_24h_0610_000001.flv", stream: "game/mc_24h", fmt: "FLV", size: 8.4, dur: "05:58:47", time: "06-10 00:00" }
];

const POSTER_CAT: Record<string, string> = {
  game: "gaming",
  show: "event",
  event: "event",
  music: "minimal",
  edu: "education",
  vod: "travel",
  live: "technology"
};

export function posterUrl(s: Stream): string {
  return `http://static.photos/${POSTER_CAT[s.app] || "technology"}/640x360/${rndInt(1, 999)}`;
}
