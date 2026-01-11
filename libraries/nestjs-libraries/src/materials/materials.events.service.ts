import { Injectable, MessageEvent } from '@nestjs/common';
import { EventEmitter } from 'events';
import { fromEvent, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface MaterialsEventPayload {
  type: string;
  [key: string]: unknown;
}

@Injectable()
export class MaterialsEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(jobId: string, payload: MaterialsEventPayload) {
    this.emitter.emit(jobId, payload);
  }

  subscribe(jobId: string): Observable<MessageEvent> {
    return fromEvent(this.emitter, jobId).pipe(
      map((payload) => {
        const event = payload as MaterialsEventPayload;
        return {
          data: event,
          type: event.type,
        } satisfies MessageEvent;
      })
    );
  }
}
