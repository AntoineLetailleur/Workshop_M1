"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const users_service_1 = __importDefault(require("../services/users.service"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const src_1 = require("../src");
const error_serializer_1 = require("../serializers/error.serializer");
const citys_service_1 = __importDefault(require("../services/citys.service"));
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const usersController = {
    validateRequest: (requiredRole) => {
        return (req, res, next) => {
            const { authorization } = req.headers;
            if (!authorization) {
                const formattedError = (0, error_serializer_1.formatJsonApiError)([
                    {
                        status: "401",
                        title: "Unauthorized",
                        detail: "Vous n'avez pas les droits suffisant pour acceder à cette ressource.",
                    },
                ]);
                res.set("Content-Type", "application/vnd.api+json");
                res.status(401).json(formattedError);
                return;
            }
            const token = authorization.split("Bearer ")[1];
            try {
                const decodedToken = jsonwebtoken_1.default.verify(token, src_1.tokenSecret);
                if (decodedToken &&
                    decodedToken.iss === "http://localhost:3000/users" &&
                    typeof decodedToken.exp !== "undefined" &&
                    decodedToken.exp < Date.now() &&
                    requiredRole.includes(decodedToken.role)) {
                    req.userId = decodedToken.userId;
                    next();
                    return;
                }
                else {
                    const formattedError = (0, error_serializer_1.formatJsonApiError)([
                        {
                            status: "403",
                            title: "Forbidden",
                            detail: "Vous n'êtes pas autorisé à effectuer cette action.",
                        },
                    ]);
                    res.set("Content-Type", "application/vnd.api+json");
                    res.status(403).json(formattedError);
                    return;
                }
            }
            catch (error) {
                console.log(error);
                const formattedError = (0, error_serializer_1.formatJsonApiError)([
                    {
                        status: "500",
                        title: "Internal server error",
                        detail: error,
                    },
                ]);
                res.set("Content-Type", "application/vnd.api+json");
                res.status(500).json(formattedError);
                return;
            }
        };
    },
    login: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { email, password } = req.body;
            req.body.password = crypto_1.default
                .createHash("sha256")
                .update(password)
                .digest("hex");
            const usersService = new users_service_1.default();
            const { user } = yield usersService.connection({ email });
            if (!user ||
                user.email !== req.body.email ||
                user.password !== req.body.password) {
                const formattedError = (0, error_serializer_1.formatJsonApiError)([
                    {
                        status: "400",
                        title: "Bad request",
                        detail: "Adresse email ou mot de passe invalide.",
                    },
                ]);
                res.set("Content-Type", "application/vnd.api+json");
                res.status(400).json(formattedError);
                return;
            }
            const token = jsonwebtoken_1.default.sign({
                userId: user.id,
                role: user.role,
            }, src_1.tokenSecret, {
                algorithm: "HS256",
                expiresIn: "24h",
                issuer: "http://localhost:3000/users",
                subject: user.id.toString(),
            });
            res.json({ token });
        }
        catch (error) {
            console.error(error);
            const formattedError = (0, error_serializer_1.formatJsonApiError)([
                {
                    status: "500",
                    title: "Internal Server Error",
                    detail: error,
                },
            ]);
            res.set("Content-Type", "application/vnd.api+json");
            res.status(500).json(formattedError);
            return;
        }
    }),
    updateCity: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const userService = new users_service_1.default();
            const cityService = new citys_service_1.default();
            const { name } = req.body;
            const idUser = req.userId;
            if (idUser) {
                const user = yield userService.findUserById(idUser);
                if (!user) {
                    const formattedError = (0, error_serializer_1.formatJsonApiError)([
                        {
                            status: "500",
                            title: "Internal Server Error",
                            detail: "No user found",
                        },
                    ]);
                    res.set("Content-Type", "application/vnd.api+json");
                    res.status(500).json(formattedError);
                    return;
                }
                var city = yield cityService.findByName(name);
                if (!city) {
                    console.log(req.body[0]);
                    const { data } = yield axios_1.default.get(`https://api-adresse.data.gouv.fr/search/?q=${req.body.name}`);
                    if (!data || !data.features || data.features.length === 0) {
                        const formattedError = (0, error_serializer_1.formatJsonApiError)([
                            {
                                status: "400",
                                title: "City not found",
                                detail: "La ville n'a pas été trouvée dans l'API.",
                            },
                        ]);
                        res.status(400).json(formattedError);
                        return;
                    }
                    const cityFeature = data.features[0];
                    const { postcode, city: name } = cityFeature.properties;
                    const [longitude, latitude] = cityFeature.geometry.coordinates;
                    let existingCity = yield prisma.cities.create({
                        data: {
                            postal: parseInt(postcode),
                            name: name,
                            x: latitude,
                            y: longitude,
                        },
                    });
                    const updateUser = yield userService.updateCityById(user.id, existingCity.id);
                    res.status(200).send(updateUser);
                }
            }
        }
        catch (error) {
            const formattedError = (0, error_serializer_1.formatJsonApiError)([
                {
                    status: "500",
                    title: "Internal Server Error",
                    detail: error,
                },
            ]);
            res.set("Content-Type", "application/vnd.api+json");
            res.status(500).json(formattedError);
            return;
        }
    }),
    getUserInfos: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const userId = req.userId;
            const usersService = new users_service_1.default();
            var data = yield usersService.getUserInfos(userId);
            if (data) {
                res.set('Content-Type', 'application/vnd.api+json');
                res.status(200).send(data);
            }
        }
        catch (error) {
            console.error(error);
            const formattedError = (0, error_serializer_1.formatJsonApiError)([
                {
                    status: '500',
                    title: 'Internal Server Error',
                    detail: error,
                },
            ]);
            res.set('Content-Type', 'application/vnd.api+json');
            res.status(500).json(formattedError);
            return;
        }
    }),
    createUser: (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { email, password, city } = req.body;
            const usersService = new users_service_1.default();
            const existingUser = yield usersService.findUserByEmail(email);
            if (existingUser) {
                const formattedError = (0, error_serializer_1.formatJsonApiError)([
                    {
                        status: '400',
                        title: 'Bad request',
                        detail: 'l\'email existe déjà.',
                    },
                ]);
                res.set('Content-Type', 'application/vnd.api+json');
                res.status(400).json(formattedError);
                return;
            }
            const { data } = yield axios_1.default.get(`https://api-adresse.data.gouv.fr/search/?q=${city}`);
            if (!data || !data.features || data.features.length === 0) {
                const formattedError = (0, error_serializer_1.formatJsonApiError)([
                    {
                        status: "400",
                        title: "City not found",
                        detail: "La ville n'a pas été trouvée dans l'API.",
                    },
                ]);
                res.status(400).json(formattedError);
                return;
            }
            const cityFeature = data.features[0];
            const { postcode, city: name } = cityFeature.properties;
            const [longitude, latitude] = cityFeature.geometry.coordinates;
            let existingCity = yield prisma.cities.findFirst({
                where: { postal: parseInt(postcode) },
            });
            if (!existingCity) {
                existingCity = yield prisma.cities.create({
                    data: {
                        postal: parseInt(postcode),
                        name: name,
                        x: latitude,
                        y: longitude,
                    },
                });
            }
            const hashedPassword = crypto_1.default.createHash('sha256').update(password).digest('hex');
            var data_ = yield usersService.createUser({
                email,
                cityId: existingCity.id,
                password: hashedPassword,
                role: 'USER'
            });
            res.set('Content-Type', 'application/vnd.api+json');
            res.status(200).send(data_);
        }
        catch (error) {
            console.error(error);
            const formattedError = (0, error_serializer_1.formatJsonApiError)([
                {
                    status: '500',
                    title: 'Internal Server Error',
                    detail: error,
                },
            ]);
            res.set('Content-Type', 'application/vnd.api+json');
            res.status(500).json(formattedError);
            return;
        }
    }),
};
exports.default = usersController;
