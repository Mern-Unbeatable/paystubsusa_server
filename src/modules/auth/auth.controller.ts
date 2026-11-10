import type { Request, Response } from "express";
import { parse } from "../../shared/middleware/validate.ts";
import { userPrincipal } from "../../shared/middleware/require-role.ts";
import type { RequestContext } from "../../shared/types.ts";
import { toUserDto, type AuthService } from "./auth.service.ts";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./auth.cookies.ts";
import { forgotPasswordBody, loginBody, registerBody, resetPasswordBody, verifyEmailBody } from "./auth.schemas.ts";
import type { IssuedSession } from "./session.service.ts";

export const requestContext = (req: Request): RequestContext => ({ ip: req.ip, userAgent: req.get("user-agent") });

function sendSession(res: Response, status: number, session: IssuedSession) {
  setRefreshCookie(res, session.refreshToken, session.rememberMe);
  res.status(status).json({ user: toUserDto(session.user), accessToken: session.accessToken });
}

export class AuthController {
  private readonly service: AuthService;

  constructor(service: AuthService) {
    this.service = service;
  }

  register = async (req: Request, res: Response) => {
    sendSession(res, 201, await this.service.register(parse(registerBody, req.body), requestContext(req)));
  };

  login = async (req: Request, res: Response) => {
    sendSession(res, 200, await this.service.login(parse(loginBody, req.body), requestContext(req)));
  };

  refresh = async (req: Request, res: Response) => {
    try {
      const session = await this.service.refresh(readRefreshCookie(req), requestContext(req));
      setRefreshCookie(res, session.refreshToken, session.rememberMe);
      res.json({ accessToken: session.accessToken });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  };

  logout = async (req: Request, res: Response) => {
    await this.service.logout(readRefreshCookie(req));
    clearRefreshCookie(res);
    res.status(204).end();
  };

  me = async (req: Request, res: Response) => {
    res.json({ user: await this.service.me(userPrincipal(req).userId) });
  };

  forgotPassword = async (req: Request, res: Response) => {
    const { email } = parse(forgotPasswordBody, req.body);
    await this.service.forgotPassword(email, requestContext(req));
    res.status(202).json({ data: { accepted: true } });
  };

  resetPassword = async (req: Request, res: Response) => {
    const { token, password } = parse(resetPasswordBody, req.body);
    await this.service.resetPassword(token, password, requestContext(req));
    res.status(204).end();
  };

  resendVerification = async (req: Request, res: Response) => {
    res.status(202).json({ data: await this.service.resendEmailVerification(userPrincipal(req).userId, requestContext(req)) });
  };

  verifyEmail = async (req: Request, res: Response) => {
    const { code } = parse(verifyEmailBody, req.body);
    res.json({ user: await this.service.verifyEmail(userPrincipal(req).userId, code, requestContext(req)) });
  };
}
