package kr.ac.mju.board.post;

public class PostNotFoundException extends RuntimeException {

    public PostNotFoundException(Long id) {
        super("게시글이 없습니다 (id=" + id + ")");
    }
}
