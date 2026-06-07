package com.varsha.auth.service;

import com.varsha.auth.model.User;
import com.varsha.auth.repository.UserRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UserService {

    private final UserRepository repo;

    public UserService(UserRepository repo) {
        this.repo = repo;
    }

    public User upsert(OAuth2User oauth2User) {
        String id = oauth2User.getAttribute("sub");
        String email = oauth2User.getAttribute("email");
        String name = oauth2User.getAttribute("name");
        String picture = oauth2User.getAttribute("picture");

        return repo.findById(id).map(existing -> {
            existing.setEmail(email);
            existing.setName(name);
            existing.setPicture(picture);
            return repo.save(existing);
        }).orElseGet(() -> repo.save(new User(id, email, name, picture)));
    }

    public Optional<User> findById(String id) {
        return repo.findById(id);
    }

    public User updateDisplayName(String userId, String displayName) {
        User user = repo.findById(userId).orElseThrow();
        user.setDisplayName(displayName);
        return repo.save(user);
    }

    // displayName (user-set) → name (Google name) → email
    public String resolvedName(User user) {
        if (user.getDisplayName() != null && !user.getDisplayName().isBlank()) return user.getDisplayName();
        if (user.getName() != null && !user.getName().isBlank()) return user.getName();
        return user.getEmail();
    }
}
