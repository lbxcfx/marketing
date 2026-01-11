import {
  Logger,
  Controller,
  Get,
  Post,
  Req,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNodeHttpEndpoint,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { MastraAgent } from '@ag-ui/mastra';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { Request, Response } from 'express';
import { RuntimeContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  integrations: string;
  organization: string;
  ui: string;
};

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService
  ) { }
  @Post('/chat')
  chatAgent(@Req() req: Request, @Res() res: Response) {
    const openAiKey = process.env.OPENAI_API_KEY || '';
    const dashScopeKey = process.env.DASHSCOPE_API_KEY || '';

    const useOpenAI = openAiKey.length > 0;
    const useDashScope = !useOpenAI && dashScopeKey.length > 0;

    if (!useOpenAI && !useDashScope) {
      Logger.warn('OpenAI/DashScope API key not set, chat functionality will not work');
      return;
    }

    const openaiClient = useDashScope
      ? new OpenAI({
        baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: dashScopeKey,
      })
      : new OpenAI({
        apiKey: openAiKey,
      });

    const serviceAdapter = new OpenAIAdapter({
      model: useOpenAI ? 'gpt-4.1' : (process.env.QWEN_MODEL || 'qwen-plus'),
      openai: openaiClient as any,
    });

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      runtime: new CopilotRuntime(),
      serviceAdapter,
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    const openAiKey = process.env.OPENAI_API_KEY || '';
    const dashScopeKey = process.env.DASHSCOPE_API_KEY || '';

    const useOpenAI = openAiKey.length > 0;
    const useDashScope = !useOpenAI && dashScopeKey.length > 0;

    if (!useOpenAI && !useDashScope) {
      Logger.warn('OpenAI/DashScope API key not set, chat functionality will not work');
      return;
    }
    const mastra = await this._mastraService.mastra();
    const runtimeContext = new RuntimeContext<ChannelsContext>();
    runtimeContext.set(
      'integrations',
      req?.body?.variables?.properties?.integrations || []
    );

    runtimeContext.set('organization', JSON.stringify(organization));
    runtimeContext.set('ui', 'true');

    const agents = MastraAgent.getLocalAgents({
      resourceId: organization.id,
      mastra,
      // @ts-ignore
      runtimeContext,
    });

    const runtime = new CopilotRuntime({
      agents,
    });

    const openaiClient = useDashScope
      ? new OpenAI({
        baseURL: process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: dashScopeKey,
      })
      : new OpenAI({
        apiKey: openAiKey,
      });

    const serviceAdapter = new OpenAIAdapter({
      model: useOpenAI ? 'gpt-4.1' : (process.env.QWEN_MODEL || 'qwen-plus'),
      openai: openaiClient as any,
    });

    const copilotRuntimeHandler = copilotRuntimeNextJSAppRouterEndpoint({
      endpoint: '/copilot/agent',
      runtime,
      // properties: req.body.variables.properties,
      serviceAdapter,
    });

    return copilotRuntimeHandler.handleRequest(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type') type: 'ai_images' | 'ai_videos'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.query({
        resourceId: organization.id,
        threadId,
      });
    } catch (err) {
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    const mastra = await this._mastraService.mastra();
    // @ts-ignore
    const memory = await mastra.getAgent('postiz').getMemory();
    const list = await memory.getThreadsByResourceIdPaginated({
      resourceId: organization.id,
      perPage: 100000,
      page: 0,
      orderBy: 'createdAt',
      sortDirection: 'DESC',
    });

    return {
      threads: list.threads.map((p) => ({
        id: p.id,
        title: p.title,
      })),
    };
  }
}
