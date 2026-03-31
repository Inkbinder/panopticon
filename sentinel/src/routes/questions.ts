import type { Request, Response } from 'express';
import type { InMemoryStore } from '../state/store.js';

export function createQuestionsRoutes(store: InMemoryStore) {
  return {
    create: (req: Request, res: Response) => {
      const body = req.body as any;
      const scope = body?.scope as 'overseer' | 'cell';
      const fromAgent = body?.fromAgent as any;
      const prompt = body?.prompt as string;
      const cellId = body?.cellId as string | undefined;

      if (!scope || !fromAgent || !prompt) {
        res.status(400).send('Missing scope/fromAgent/prompt');
        return;
      }

      const q = store.createQuestion({ scope, fromAgent, prompt, cellId });
      res.status(201).json(q);
    },

    answer: (req: Request, res: Response) => {
      const id = req.params.id;
      const body = req.body as any;
      const answer = body?.answer as string;
      if (!answer || answer.trim().length === 0) {
        res.status(400).send('Missing answer');
        return;
      }

      const q = store.answerQuestion(id, answer.trim());
      if (!q) {
        res.status(404).send('Question not found');
        return;
      }
      res.status(200).json(q);
    },
  };
}
