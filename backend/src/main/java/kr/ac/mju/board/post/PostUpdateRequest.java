package kr.ac.mju.board.post;

import jakarta.validation.constraints.Size;

/** 수정 요청 본문: 보낸 필드만 바뀐다 (null이면 그대로) */
public record PostUpdateRequest(
        @Size(max = 200, message = "title은 200자 이하여야 합니다")
        String title,

        String content,

        @Size(max = 50, message = "author는 50자 이하여야 합니다")
        String author
) {
}
