import { Module } from '@nestjs/common';
import { MediaCrawlerService } from '@gitroom/nestjs-libraries/materials/materials.crawler.service';
import { MaterialsEventsService } from '@gitroom/nestjs-libraries/materials/materials.events.service';
import { MaterialsQueueService } from '@gitroom/nestjs-libraries/materials/materials.queue.service';
import { MaterialsService } from '@gitroom/nestjs-libraries/materials/materials.service';

@Module({
  providers: [
    MediaCrawlerService,
    MaterialsEventsService,
    MaterialsQueueService,
    MaterialsService,
  ],
  exports: [
    MediaCrawlerService,
    MaterialsEventsService,
    MaterialsQueueService,
    MaterialsService,
  ],
})
export class MaterialsModule { }
