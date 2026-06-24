import { useEffect, useState } from 'react';
import { QueueState } from '../types';
import * as Player from './player';

export function usePlayer(): QueueState {
  const [state, setState] = useState<QueueState>(Player.getState());

  useEffect(() => {
    const unsub = Player.subscribe(setState);
    return unsub;
  }, []);

  return state;
}