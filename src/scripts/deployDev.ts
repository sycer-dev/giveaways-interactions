import 'reflect-metadata';
process.env.NODE_ENV ??= 'development';

import { createJSON, inviteJSON, pingJSON } from '../commands';
import { deploy } from './deploy';

const data = [createJSON, inviteJSON, pingJSON];

void deploy(data, true);
