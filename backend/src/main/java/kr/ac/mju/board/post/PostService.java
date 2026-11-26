package kr.ac.mju.board.post;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class PostService {

    private final PostRepository repository;

    // Grafana "작성/수정/삭제 이벤트" 패널용 커스텀 메트릭 → board_post_events_total{action=...}
    private final Counter createdCounter;
    private final Counter updatedCounter;
    private final Counter deletedCounter;

    public PostService(PostRepository repository, MeterRegistry registry) {
        this.repository = repository;
        this.createdCounter = counter(registry, "create");
        this.updatedCounter = counter(registry, "update");
        this.deletedCounter = counter(registry, "delete");
    }

    private static Counter counter(MeterRegistry registry, String action) {
        return Counter.builder("board.post.events")
                .description("게시글 이벤트 수")
                .tag("action", action)
                .register(registry);
    }

    public List<Post> findAll() {
        return repository.findAllByOrderByIdDesc();
    }

    public Post findById(Long id) {
        return repository.findById(id).orElseThrow(() -> new PostNotFoundException(id));
    }

    @Transactional
    public Post create(PostRequest req) {
        Post post = repository.save(new Post(req.title().strip(), req.content().strip(), authorOrAnonymous(req.author())));
        createdCounter.increment();
        return post;
    }

    @Transactional
    public Post update(Long id, PostUpdateRequest req) {
        if (req.title() == null && req.content() == null && req.author() == null) {
            throw new IllegalArgumentException("수정할 항목이 없습니다");
        }
        Post post = findById(id);
        if (req.title() != null) {
            if (req.title().isBlank()) throw new IllegalArgumentException("title은 비워둘 수 없습니다");
            post.setTitle(req.title().strip());
        }
        if (req.content() != null) {
            if (req.content().isBlank()) throw new IllegalArgumentException("content는 비워둘 수 없습니다");
            post.setContent(req.content().strip());
        }
        if (req.author() != null) {
            post.setAuthor(authorOrAnonymous(req.author()));
        }
        // flush를 먼저 해야 @PreUpdate가 실행되어 응답에 새 updated_at이 들어간다
        repository.saveAndFlush(post);
        updatedCounter.increment();
        return post;
    }

    @Transactional
    public void delete(Long id) {
        Post post = findById(id);
        repository.delete(post);
        deletedCounter.increment();
    }

    private static String authorOrAnonymous(String author) {
        return (author == null || author.isBlank()) ? "익명" : author.strip();
    }
}
