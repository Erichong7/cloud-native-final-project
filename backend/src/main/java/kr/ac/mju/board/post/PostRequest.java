package kr.ac.mju.board.post;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 작성 요청 본문: {"title": "...", "content": "...", "author": "..."} */
public record PostRequest(
        @NotBlank(message = "title은 필수입니다")
        @Size(max = 200, message = "title은 200자 이하여야 합니다")
        String title,

        @NotBlank(message = "content는 필수입니다")
        String content,

        @Size(max = 50, message = "author는 50자 이하여야 합니다")
        String author
) {
}
