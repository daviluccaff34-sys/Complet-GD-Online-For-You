#include <Geode/Geode.hpp>
#include <Geode/modify/MenuLayer.hpp>
#include "../auth/GeometryDashAuth.hpp"
#include "../net/ApiClient.hpp"

using namespace geode::prelude;

namespace cgdof::ui {

class MainHubLayer final : public CCLayer {
protected:
    CCLabelBMFont* m_status = nullptr;
    CCTextInputNode* m_roomInput = nullptr;
    CCTextInputNode* m_chatInput = nullptr;
    std::string m_roomId;
    std::string m_conversationId;
    int m_revision = 0;

    void setStatus(std::string const& value) {
        if (m_status) m_status->setString(value.c_str());
    }

    void onLogin(CCObject*) {
        setStatus("Conectando à conta Geometry Dash...");
        retain();
        cgdof::auth::startGeometryDashAuth(
            [this](int accountId, int, std::string, geode::Result<std::string> tokenResult) {
                if (!tokenResult.isOk()) {
                    setStatus("Falha no Argon. Tente novamente.");
                    release();
                    return;
                }
                cgdof::net::authenticate(accountId, std::move(tokenResult).unwrap(),
                    [this](bool ok, matjson::Value data, std::string error) {
                        if (ok) {
                            auto player = data["player"]["username"].asString().unwrapOr("Jogador");
                            setStatus("Conectado como " + player + "!");
                        } else setStatus("Login: " + error.substr(0, 90));
                        release();
                    }
                );
            }
        );
    }

    void onCreateRoom(CCObject*) {
        if (!cgdof::net::hasSession()) {
            setStatus("Entre com sua conta GD primeiro.");
            return;
        }
        setStatus("Criando sala online...");
        retain();
        cgdof::net::createRoom([this](bool ok, matjson::Value data, std::string error) {
            if (ok) {
                m_roomId = data["roomId"].asString().unwrapOr("");
                setStatus("Sala criada: " + m_roomId + " | Compartilhe o código!");
            } else setStatus("Sala: " + error.substr(0, 90));
            release();
        });
    }

    void onJoinRoom(CCObject*) {
        if (!cgdof::net::hasSession()) {
            setStatus("Entre com sua conta GD primeiro.");
            return;
        }
        m_roomId = m_roomInput ? m_roomInput->getString() : "";
        if (m_roomId.size() < 4 || m_roomId.size() > 32) {
            setStatus("Digite um código de sala válido.");
            return;
        }
        refreshRoom();
    }

    void refreshRoom() {
        retain();
        cgdof::net::getRoomState(m_roomId, m_revision, [this](bool ok, matjson::Value data, std::string error) {
            if (!ok) {
                setStatus("Sala: " + error.substr(0, 90));
            } else {
                m_revision = static_cast<int>(data["revision"].asInt().unwrapOr(0));
                auto members = data["members"].asArray();
                auto count = members.isOk() ? members.unwrap().size() : 0;
                auto events = data["events"].asArray();
                auto eventCount = events.isOk() ? events.unwrap().size() : 0;
                setStatus("Sala " + m_roomId + " | Jogadores: " + std::to_string(count) +
                    " | Novas atualizações: " + std::to_string(eventCount) +
                    " | Revisão: " + std::to_string(m_revision));
            }
            release();
        });
    }

    void onSendChat(CCObject*) {
        if (!cgdof::net::hasSession() || m_roomId.empty()) {
            setStatus("Entre em uma sala antes de enviar mensagens.");
            return;
        }
        auto message = m_chatInput ? std::string(m_chatInput->getString()) : "";
        if (message.empty()) return;
        retain();
        cgdof::net::sendRoomChat(m_roomId, message, [this](bool ok, matjson::Value, std::string error) {
            setStatus(ok ? "Mensagem enviada para a sala." : "Chat: " + error.substr(0, 90));
            release();
        });
    }

    void onSendEdit(CCObject*) {
        if (!cgdof::net::hasSession() || m_roomId.empty()) {
            setStatus("Crie ou entre em uma sala primeiro.");
            return;
        }
        // Shared-editor transport prototype: a neutral marker object proves that
        // edit operations reach the room. Native GD editor-object conversion is next.
        matjson::Value object = matjson::Value::object();
        object["id"] = "prototype-" + std::to_string(m_revision + 1);
        object["x"] = 150 + (m_revision % 5) * 30;
        object["y"] = 90;
        object["kind"] = "collab-marker";
        matjson::Value operation = matjson::Value::object();
        operation["action"] = "add";
        operation["object"] = std::move(object);
        retain();
        cgdof::net::sendLevelOperation(m_roomId, std::move(operation),
            [this](bool ok, matjson::Value, std::string error) {
                setStatus(ok ? "Operação colaborativa enviada! Atualize a sala para ver a revisão."
                             : "Editor: " + error.substr(0, 90));
                release();
            }
        );
    }

    void onAskAI(CCObject*) {
        if (!cgdof::net::hasSession()) {
            setStatus("Entre com sua conta GD para usar a IA.");
            return;
        }
        auto message = m_chatInput ? std::string(m_chatInput->getString()) : "";
        if (message.empty()) {
            setStatus("Digite uma mensagem para a Gemini.");
            return;
        }
        setStatus("Gemini está pensando...");
        retain();
        cgdof::net::sendChat(message, m_conversationId, [this](bool ok, matjson::Value data, std::string error) {
            if (ok) {
                m_conversationId = data["conversationId"].asString().unwrapOr("");
                auto answer = data["answer"].asString().unwrapOr("Resposta vazia.");
                setStatus("GEMINI: " + answer.substr(0, 220));
            } else setStatus("IA: " + error.substr(0, 90));
            release();
        });
    }

    void onCloud(CCObject*) {
        if (!cgdof::net::hasSession()) {
            setStatus("Entre com sua conta GD para acessar a nuvem.");
            return;
        }
        retain();
        cgdof::net::listCloudFiles([this](bool ok, matjson::Value data, std::string error) {
            if (ok) {
                auto files = data["files"].asArray();
                auto count = files.isOk() ? files.unwrap().size() : 0;
                setStatus("Armazenamento online: " + std::to_string(count) + " arquivo(s).");
            } else setStatus("Nuvem: " + error.substr(0, 90));
            release();
        });
    }

public:
    static CCScene* scene() {
        auto scene = CCScene::create();
        auto layer = new MainHubLayer();
        if (layer && layer->init()) {
            layer->autorelease();
            scene->addChild(layer);
            return scene;
        }
        CC_SAFE_DELETE(layer);
        return nullptr;
    }

    bool init() override {
        if (!CCLayer::init()) return false;
        auto size = CCDirector::sharedDirector()->getWinSize();
        auto background = CCLayerColor::create(ccc4(13, 9, 30, 255));
        this->addChild(background, -1);

        auto title = CCLabelBMFont::create("COMPLET GD ONLINE", "bigFont.fnt");
        title->setScale(0.72f);
        title->setPosition({ size.width / 2, size.height - 28 });
        this->addChild(title);

        auto subtitle = CCLabelBMFont::create("ONLINE  •  COLLAB EDITOR  •  GEMINI AI", "goldFont.fnt");
        subtitle->setScale(0.42f);
        subtitle->setPosition({ size.width / 2, size.height - 52 });
        this->addChild(subtitle);

        m_status = CCLabelBMFont::create("Pronto. Entre com sua conta Geometry Dash.", "bigFont.fnt");
        m_status->setScale(0.36f);
        m_status->setWidth(size.width - 32);
        m_status->setAnchorPoint({ 0.5f, 0.5f });
        m_status->setPosition({ size.width / 2, size.height * 0.48f });
        this->addChild(m_status);

        m_roomInput = CCTextInputNode::create(180, 28, "Código da sala", "bigFont.fnt");
        m_roomInput->setPosition({ size.width * 0.30f, size.height * 0.35f });
        this->addChild(m_roomInput);

        m_chatInput = CCTextInputNode::create(240, 28, "Mensagem para sala ou IA", "bigFont.fnt");
        m_chatInput->setPosition({ size.width * 0.70f, size.height * 0.35f });
        this->addChild(m_chatInput);

        auto menu = CCMenu::create();
        menu->setPosition({ 0, 0 });
        this->addChild(menu);

        auto addButton = [&](char const* text, float x, float y, SEL_MenuHandler callback) {
            auto label = CCLabelBMFont::create(text, "bigFont.fnt");
            label->setScale(0.48f);
            auto item = CCMenuItemLabel::create(label, this, callback);
            item->setPosition({ x, y });
            menu->addChild(item);
        };

        float left = size.width * 0.22f;
        float mid = size.width * 0.50f;
        float right = size.width * 0.78f;
        float top = size.height * 0.23f;
        float bottom = size.height * 0.12f;
        addButton("LOGIN GD", left, top, menu_selector(MainHubLayer::onLogin));
        addButton("CRIAR SALA", mid, top, menu_selector(MainHubLayer::onCreateRoom));
        addButton("ENTRAR", right, top, menu_selector(MainHubLayer::onJoinRoom));
        addButton("ATUALIZAR SALA", left, bottom, menu_selector(MainHubLayer::onRefreshRoom));
        addButton("CHAT SALA", mid, bottom, menu_selector(MainHubLayer::onSendChat));
        addButton("ENVIAR EDICAO", right, bottom, menu_selector(MainHubLayer::onSendEdit));
        addButton("PERGUNTAR IA", mid, size.height * 0.055f, menu_selector(MainHubLayer::onAskAI));
        addButton("NUVEM", right, size.height * 0.055f, menu_selector(MainHubLayer::onCloud));
        addButton("VOLTAR", left, size.height * 0.055f, menu_selector(MainHubLayer::onBack));
        return true;
    }

    void onRefreshRoom(CCObject*) {
        if (m_roomId.empty() && m_roomInput) m_roomId = m_roomInput->getString();
        if (m_roomId.empty()) setStatus("Crie ou entre em uma sala primeiro.");
        else refreshRoom();
    }
    void onBack(CCObject*) {
        CCDirector::sharedDirector()->popScene();
    }
};

} // namespace cgdof::ui

class $modify(CompletGDMenuLayer, MenuLayer) {
    bool init() {
        if (!MenuLayer::init()) return false;
        auto menu = this->getChildByID("bottom-menu");
        if (menu) {
            auto sprite = CCSprite::createWithSpriteFrameName("GJ_likeBtn_001.png");
            if (sprite) {
                auto button = CCMenuItemSpriteExtra::create(
                    sprite, this, menu_selector(CompletGDMenuLayer::onOpenCompletHub)
                );
                button->setID("complet-gd-online-hub"_spr);
                menu->addChild(button);
                menu->updateLayout();
            }
        }
        return true;
    }

    void onOpenCompletHub(CCObject*) {
        auto scene = cgdof::ui::MainHubLayer::scene();
        if (scene) CCDirector::sharedDirector()->pushScene(CCTransitionFade::create(0.25f, scene));
    }
};
