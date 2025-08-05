// @ts-check
//
//  Created by Chen Mingliang on
//  illuspas@msn.com
//  Copyright (c) 2023 Nodemedia. All rights reserved.
//

class Fmp4 {
  constructor() {
    this._avc = null;
    this._avcC = null;
    this._avcSps = null;
    this._avcPps = null;
    this._avcSeqHdr = null;
    this._avcSeqHdrLen = 0;
    this._avcSeqHdrPos = 0;
  }

}

module.exports = Fmp4;