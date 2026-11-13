#include "ApiClient.hpp"

#include <Geode/utils/web.hpp>
#include <utility>

using namespace geode::prelude;

namespace cgdof::net {
namespace {
std::string s_session;

std::string url(std::string_view path) {
    return std::string(API_BASE) + std::string(path);
}

void parseResponse(web::WebResponse response, ApiCallback callback) {
    if (!response.ok()) {
        auto text = response.string();
        callback(false, matjson::Value(), text.isOk() ? text.unwrap() : "Falha de conexão com o servidor.");
        return;
    }
    auto parsed = response.json();
    if (!parsed.isOk()) {
        callback(false, matjson::Value(), "O servidor retornou uma resposta inválida.");
        return;
    }
    callback(true, parsed.unwrap(), {});
}

web::WebRequest authorizedRequest() {
    return web::WebRequest()
        .header("authorization", "Bearer " + s_session)
        .header("content-type", "application/json");
}
}

void setSession(std::string token) {
    s_session = std::move(token);
}

bool hasSession() {
    return !s_session.empty();
}

void authenticate(int accountId, std::string token, ApiCallback callback) {
    matjson::Value body = matjson::Value::object();
    body["accountId"] = accountId;
    body["token"] = std::move(token);
    async::spawn(
        web::WebRequest().header("content-type", "application/json")
            .bodyJSON(body).post(url("/api/auth/argon")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            if (!response.ok()) {
                auto text = response.string();
                callback(false, matjson::Value(), text.isOk() ? text.unwrap() : "A conta não foi autenticada.");
                return;
            }
            auto parsed = response.json();
            if (!parsed.isOk()) {
                callback(false, matjson::Value(), "Resposta de autenticação inválida.");
                return;
            }
            auto data = parsed.unwrap();
            auto tokenValue = data["sessionToken"].asString();
            if (!tokenValue.isOk() || tokenValue.unwrap().empty()) {
                callback(false, matjson::Value(), "O servidor não forneceu uma sessão.");
                return;
            }
            setSession(tokenValue.unwrap());
            callback(true, std::move(data), {});
        }
    );
}

void sendChat(std::string message, std::string conversationId, ApiCallback callback) {
    matjson::Value body = matjson::Value::object();
    body["message"] = std::move(message);
    if (!conversationId.empty()) body["conversationId"] = std::move(conversationId);
    async::spawn(
        authorizedRequest().bodyJSON(body).post(url("/api/ai/chat")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            parseResponse(std::move(response), std::move(callback));
        }
    );
}

void createRoom(ApiCallback callback) {
    matjson::Value body = matjson::Value::object();
    async::spawn(
        authorizedRequest().bodyJSON(body).post(url("/api/rooms")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            parseResponse(std::move(response), std::move(callback));
        }
    );
}

void getRoomState(std::string roomId, int sinceRevision, ApiCallback callback) {
    auto request = authorizedRequest().get(url("/api/rooms/" + roomId + "/state"));
    request.param("since", std::to_string(sinceRevision));
    async::spawn(std::move(request), [callback = std::move(callback)](web::WebResponse response) mutable {
        parseResponse(std::move(response), std::move(callback));
    });
}

void sendRoomChat(std::string roomId, std::string message, ApiCallback callback) {
    matjson::Value body = matjson::Value::object();
    body["type"] = "chat";
    body["text"] = std::move(message);
    async::spawn(
        authorizedRequest().bodyJSON(body).post(url("/api/rooms/" + roomId + "/events")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            parseResponse(std::move(response), std::move(callback));
        }
    );
}

void sendLevelOperation(std::string roomId, matjson::Value operation, ApiCallback callback) {
    matjson::Value body = matjson::Value::object();
    body["type"] = "level_operation";
    body["operation"] = std::move(operation);
    async::spawn(
        authorizedRequest().bodyJSON(body).post(url("/api/rooms/" + roomId + "/events")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            parseResponse(std::move(response), std::move(callback));
        }
    );
}

void listCloudFiles(ApiCallback callback) {
    async::spawn(
        authorizedRequest().get(url("/api/storage/files")),
        [callback = std::move(callback)](web::WebResponse response) mutable {
            parseResponse(std::move(response), std::move(callback));
        }
    );
}

} // namespace cgdof::net
