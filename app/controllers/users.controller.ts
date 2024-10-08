import UsersService from "../services/users.service";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Request, Response } from "express";
import { tokenSecret } from "../src";
import { formatJsonApiError } from "../serializers/error.serializer";

const usersController = {
  validateRequest: (requiredRole: string[]) => {
    return (req: Request, res: Response, next: Function) => {
      const { authorization } = req.headers;

      if (!authorization) {
        const formattedError = formatJsonApiError([
          {
            status: "401",
            title: "Unauthorized",
            detail:
              "Vous n'avez pas les droits suffisant pour acceder à cette ressource.",
          },
        ]);
        res.set("Content-Type", "application/vnd.api+json");
        return res.status(401).json(formattedError);
      }

      const token = authorization.split("Bearer ")[1];

      try {
        const decodedToken = jwt.verify(token, tokenSecret) as jwt.JwtPayload;

        if (
          decodedToken &&
          decodedToken.iss === "http://localhost:3000/users" &&
          typeof decodedToken.exp !== "undefined" &&
          decodedToken.exp < Date.now() &&
          requiredRole.includes(decodedToken.role)
        ) {
          req.userId = decodedToken.userId;
          next();
          return;
        } else {
          const formattedError = formatJsonApiError([
            {
              status: "403",
              title: "Forbidden",
              detail: "Vous n'êtes pas autorisé à effectuer cette action.",
            },
          ]);
          res.set("Content-Type", "application/vnd.api+json");
          return res.status(403).json(formattedError);
        }
      } catch (error) {
        console.log(error);
        const formattedError = formatJsonApiError([
          {
            status: "500",
            title: "Internal server error",
            detail: error,
          },
        ]);
        res.set("Content-Type", "application/vnd.api+json");
        return res.status(500).json(formattedError);
      }
    };
  },

  login: async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      req.body.password = crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");
      const usersService = new UsersService();
      const { user }: { user: any } = await usersService.connection({ email });

      if (
        !user ||
        user.email !== req.body.email ||
        user.password !== req.body.password
      ) {
        const formattedError = formatJsonApiError([
          {
            status: "400",
            title: "Bad request",
            detail: "Adresse email ou mot de passe invalide.",
          },
        ]);
        res.set("Content-Type", "application/vnd.api+json");
        return res.status(400).json(formattedError);
      }

      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role.libelle,
        },
        tokenSecret,
        {
          algorithm: "HS256",
          expiresIn: "24h",
          issuer: "http://localhost:3000/users",
          subject: user.id.toString(),
        }
      );

      return res.json({ token });
    } catch (error) {
      console.error(error);
      const formattedError = formatJsonApiError([
        {
          status: "500",
          title: "Internal Server Error",
          detail: error,
        },
      ]);
      res.set("Content-Type", "application/vnd.api+json");
      return res.status(500).json(formattedError);
    }
  },

  createUser: async (req: Request, res: Response) => {
    try {
      const { email, password, pseudo, ville, codePostal } = req.body;
      const usersService = new UsersService();

      const existingUser = await usersService.findUserByEmail(email);
      if (existingUser) {
        const formattedError = formatJsonApiError([
          {
            status: "400",
            title: "Bad request",
            detail: "l'email existe déjà.",
          },
        ]);
        res.set("Content-Type", "application/vnd.api+json");
        return res.status(400).json(formattedError);
      }

      const hashedPassword = crypto
        .createHash("sha256")
        .update(password)
        .digest("hex");

      var data = await usersService.createUser({
        email,
        password: hashedPassword,
        pseudo,
        ville,
        codePostal,
        roleId: 2,
      });
      res.set("Content-Type", "application/json");
      return res.status(200).send(data);
    } catch (error) {
      console.error(error);
      const formattedError = formatJsonApiError([
        {
          status: "500",
          title: "Internal Server Error",
          detail: error,
        },
      ]);
      res.set("Content-Type", "application/vnd.api+json");
      return res.status(500).json(formattedError);
    }
  },
};

export default usersController;
