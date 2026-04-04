import type { Request, Response } from 'express';
import type { InMemoryStore } from '../state/store';
import { questionAnswerBodySchema, questionCreateBodySchema, sendValidationError } from '../validation';

export function createQuestionsRoutes(store: InMemoryStore) {
  return {
    create: (req: Request, res: Response) => {
      const parsedBody = questionCreateBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        sendValidationError(res, parsedBody.error);
        return;
      }

      const q = store.createQuestion(parsedBody.data);
      res.status(201).json(q);
    },

    answer: (req: Request, res: Response) => {
      const id = req.params.id;
      const parsedBody = questionAnswerBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        sendValidationError(res, parsedBody.error);
        return;
      }

      const q = store.answerQuestion(id, parsedBody.data.answer);
      if (!q) {
        res.status(404).send('Question not found');
        return;
      }
      res.status(200).json(q);
    },
  };
}
