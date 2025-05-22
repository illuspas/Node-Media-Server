// @ts-check
//
//  Created by Chen Mingliang on 25/05/22.
//  illuspas@msn.com
//  Copyright (c) 2025 NodeMedia. All rights reserved.
//

const Context = require("../core/context.js");
const express = require("express");

/**
 * 获取所有会话
 * @param {express.Request} req
 * @param {express.Response} res
 */
function handleGetSessions(req, res) {
  let data = [];
  for (const [id, session] of Context.sessions) {
    data.push({
      id,
      ip: session.ip,
      protocol: session.protocol,
      streamApp: session.streamApp,
      streamName: session.streamName,
      streamQuery: session.streamQuery,
      createTime: session.createTime,
      isPublisher: session.isPublisher,
      inBytes: session.inBytes,
      outBytes: session.outBytes,
    });
  }
  res.json({ data });
}

/**
 * 获取指定流的所有会话
 * @param {express.Request} req
 * @param {express.Response} res
 */
function handleGetStreamSessions(req, res) {
  let data = [];
  for (const [id, session] of Context.sessions) {
    if (session.streamApp === req.params.app && session.streamName === req.params.name) {
      data.push({
        id,
        ip: session.ip,
        protocol: session.protocol,
        streamApp: session.streamApp,
        streamName: session.streamName,
        streamQuery: session.streamQuery,
        createTime: session.createTime,
        isPublisher: session.isPublisher,
        inBytes: session.inBytes,
        outBytes: session.outBytes,
      });
    }
  }
  res.json({ data });
}

/**
 * 获取单个会话
 * @param {express.Request} req
 * @param {express.Response} res
 */
function handleGetSession(req, res) {
  let session = Context.sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  let data = {
    id: session.id,
    ip: session.ip,
    protocol: session.protocol,
    streamApp: session.streamApp,
    streamName: session.streamName,
    streamQuery: session.streamQuery,
    createTime: session.createTime,
    isPublisher: session.isPublisher,
    inBytes: session.inBytes,
    outBytes: session.outBytes,
  };
  res.json({ data: data });
}

/**
 * 删除单个会话, 可以结束指定id的推流或者拉流
 * @param {express.Request} req
 * @param {express.Response} res
 */
function handleDeleteSession(req, res) {
  let session = Context.sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  session.close();
  res.json({ data: { id: session.id } });
}

module.exports = { handleGetSessions, handleGetStreamSessions, handleGetSession, handleDeleteSession };