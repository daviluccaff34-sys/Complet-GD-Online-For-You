#pragma once

#include <Geode/Geode.hpp>
#include <string>

namespace cgdof::auth {

using AuthCallback = geode::Function<void(
    int accountId,
    int userId,
    std::string username,
    geode::Result<std::string> tokenResult
)>;

// Call this from the game's main thread.
// The callback runs when Argon finishes its asynchronous authentication.
void startGeometryDashAuth(AuthCallback callback);

} // namespace cgdof::auth
