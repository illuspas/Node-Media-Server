//  Created by Mingliang Chen on 17/8/23.
//  illuspas[a]gmail.com
//  Copyright (c) 2017 Nodemedia. All rights reserved.

import * as uuid from 'uuid';
import { EventEmitter } from 'events';

export function generateNewSessionID() {
  return uuid.v4();
}

export const nodeEvent = new EventEmitter();
