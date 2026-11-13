#pragma once

#include <Geode/Geode.hpp>
#include <matjson.hpp>
#include <string>

namespace cgdof::net {

using ApiCallback = geode::Function<void(bool ok, matjson::Value data, std::string error)>;

// Replace this with the workers.dev URL shown after deploying cloudflare/worker.
inline constexpr char API_BASE[] = "https://complet-gd-online-api.workers.dev";

void setSession(std::string token);
bool hasSession();

void authenticate(int accountId, std::string token, ApiCallback callback);
void sendChat(std::string message, std::string conversationId, ApiCallback callback);
void createRoom(ApiCallback callback);
void getRoomState(std::string roomId, int sinceRevision, ApiCallback callback);
void sendRoomChat(std::string roomId, std::string message, ApiCallback callback);
void sendLevelOperation(std::string roomId, matjson::Value operation, ApiCallback callback);
void listCloudFiles(ApiCallback callback);

} // namespace cgdof::net
