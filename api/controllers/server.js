//
//  Created by Mingliang Chen on 17/12/24.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.
//

const OS = require('os');

function cpuAverage() {

  //Initialise sum of idle and time of cores and fetch CPU info
  let totalIdle = 0, totalTick = 0;
  let cpus = OS.cpus();

  //Loop through CPU cores
  for (let i = 0, len = cpus.length; i < len; i++) {

    //Select CPU core
    let cpu = cpus[i];

    //Total up the time in the cores tick
    for (type in cpu.times) {
      totalTick += cpu.times[type];
    }

    //Total up the idle time of the core
    totalIdle += cpu.times.idle;
  }

  //Return the average Idle and Tick times
  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
}

function percentageCPU() {
  return new Promise(function (resolve, reject) {
    let startMeasure = cpuAverage();
    setTimeout(() => {
      let endMeasure = cpuAverage();
      //Calculate the difference in idle and total time between the measures
      let idleDifference = endMeasure.idle - startMeasure.idle;
      let totalDifference = endMeasure.total - startMeasure.total;

      //Calculate the average percentage CPU usage
      let percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
      resolve(percentageCPU);
    }, 100);
  });
}

function getRTBytes(sessions) {
  return new Promise(function (resolve, reject) {
    let bytes = {
      inbytes: 0,
      outbytes: 0,
    };
    sessions.forEach((session, id) => {
      let socket = session.constructor.name === 'NodeFlvSession' ? session.req.socket : session.socket;
      bytes.inbytes += socket.bytesRead;
      bytes.outbytes += socket.bytesWritten;
    });
    resolve(bytes);
  });
}

async function getInfo(req, res, next) {
  let rtBytes = await getRTBytes(this.sessions);
  let info = {
    uptime: Date.now() - this.startTime,
    os: {
      arch: OS.arch(),
      platform: OS.platform(),
      release: OS.release(),
    },
    cpu: {
      num: OS.cpus().length,
      load: await percentageCPU(),
      model: OS.cpus()[0].model,
      speed: OS.cpus()[0].speed,
    },
    mem: {
      totle: OS.totalmem(),
      free: OS.freemem()
    },
    net: {
      inbytes: this.inbytes + rtBytes.inbytes,
      outbytes: this.outbytes + rtBytes.outbytes,
    },
    clients: {
      accepted: this.accepted,
      active: this.sessions.size - this.idlePlayers.size,
      idle: this.idlePlayers.size,
    }
  };
  res.json(info);
}

exports.getInfo = getInfo;